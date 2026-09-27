'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loads and validates visualizer-config.json
 * @param {string} configPath
 * @param {object} [logger=console]
 * @returns {object} Validated configuration object
 */
function loadConfig(configPath, logger = console) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found at ${configPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read configuration file at ${configPath}: ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON in configuration file at ${configPath}: ${err.message}`);
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Invalid configuration format at ${configPath}: expected an object`);
  }

  if (!Array.isArray(config.scanConfig)) {
    logger.warn(`Warning: 'scanConfig' is missing or not an array in ${configPath}`);
    config.scanConfig = [];
  }

  if (!Array.isArray(config.tags)) {
    logger.warn(`Warning: 'tags' is missing or not an array in ${configPath}`);
    config.tags = [];
  }

  return config;
}

/**
 * Ingests tsconfig.json compilerOptions.paths if available (supporting JSONC comments)
 * @param {string} workspaceRoot
 * @param {object} logger
 * @returns {object} Path aliases mapping
 */
function loadTsConfig(workspaceRoot, logger = console) {
  const tsConfigPath = path.join(workspaceRoot, 'tsconfig.json');
  let tsConfigPaths = {};
  if (fs.existsSync(tsConfigPath)) {
    try {
      const raw = fs.readFileSync(tsConfigPath, 'utf8');
      const sanitized = stripCommentsSafe(raw);
      const tsConfig = JSON.parse(sanitized);
      if (tsConfig.compilerOptions && tsConfig.compilerOptions.paths) {
        tsConfigPaths = tsConfig.compilerOptions.paths;
      }
    } catch (err) {
      logger.warn(`Warning: Could not parse tsconfig.json: ${err.message}`);
    }
  }
  return tsConfigPaths;
}

/**
 * Builds tag lookup map (name.toLowerCase() -> tag config object)
 * @param {Array} tags
 * @returns {Map<string, object>}
 */
function buildTagMap(tags = []) {
  const tagMap = new Map();
  if (Array.isArray(tags)) {
    tags.forEach(tag => {
      if (tag && tag.name) {
        tagMap.set(tag.name.toLowerCase(), tag);
      }
    });
  }
  return tagMap;
}

/**
 * Extracts named re-exports from an index file (ignoring commented-out exports)
 * @param {string} absTarget
 * @param {Map<string, string>} reExportMap
 */
function parseReExportsFromFile(absTarget, reExportMap) {
  try {
    const indexContent = fs.readFileSync(absTarget, 'utf8');
    const sanitized = stripCommentsSafe(indexContent);
    const reExportRegex = /export\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = reExportRegex.exec(sanitized)) !== null) {
      const rawExports = match[1];
      const subfileRel = match[2];
      const subfileBase = path.basename(subfileRel, path.extname(subfileRel));
      const exportsList = rawExports.split(',').map(s => s.trim()).filter(Boolean);
      exportsList.forEach(expName => {
        const cleanExp = expName.replace(/^type\s+/, '');
        const parts = cleanExp.split(/\s+as\s+/);
        const exportedName = parts[parts.length - 1].trim();
        reExportMap.set(exportedName, subfileBase);
      });
    }

    const wildcardRegex = /export\s+\*\s+from\s+['"`]([^'"`]+)['"`]/g;
    let wildMatch;
    while ((wildMatch = wildcardRegex.exec(sanitized)) !== null) {
      const subfileRel = wildMatch[1];
      const subfileBase = path.basename(subfileRel, path.extname(subfileRel));
      const dir = path.dirname(absTarget);
      const targetPath = path.resolve(dir, subfileRel);

      let resolvedPath = '';
      if (fs.existsSync(targetPath)) {
        try {
          if (fs.statSync(targetPath).isFile()) {
            resolvedPath = targetPath;
          }
        } catch (_) {}
      }
      if (!resolvedPath) {
        for (const ext of ['.ts', '.js', '/index.ts', '/index.js']) {
          const testPath = targetPath + ext;
          if (fs.existsSync(testPath)) {
            try {
              if (fs.statSync(testPath).isFile()) {
                resolvedPath = testPath;
                break;
              }
            } catch (_) {}
          }
        }
      }

      if (resolvedPath) {
        try {
          const subContent = fs.readFileSync(resolvedPath, 'utf8');
          const subSanitized = stripCommentsSafe(subContent);
          const exportIdentRegex = /export\s+(?:(?:default|abstract)\s+)?(?:async\s+)?(?:function(?:\s*\*\s*|\s+)|\s*class\s+|(?:const|let|var)\s+)(\w+)/g;
          let expMatch;
          while ((expMatch = exportIdentRegex.exec(subSanitized)) !== null) {
            if (expMatch[1]) {
              reExportMap.set(expMatch[1], subfileBase);
            }
          }

          const localExportRegex = /export\s+\{([^}]+)\}(?!\s*from)/g;
          let locMatch;
          while ((locMatch = localExportRegex.exec(subSanitized)) !== null) {
            const items = locMatch[1].split(',').map(s => s.trim()).filter(Boolean);
            items.forEach(item => {
              const cleanItem = item.replace(/^type\s+/, '').split(/\s+as\s+/);
              const name = cleanItem[cleanItem.length - 1].trim();
              if (name) reExportMap.set(name, subfileBase);
            });
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/**
 * Builds re-export map for index files defined in tsconfig paths
 * @param {string} workspaceRoot
 * @param {object} tsConfigPaths
 * @returns {Map<string, string>}
 */
function buildReExportMap(workspaceRoot, tsConfigPaths = {}) {
  const reExportMap = new Map();
  Object.keys(tsConfigPaths).forEach(alias => {
    const targetArray = tsConfigPaths[alias];
    if (Array.isArray(targetArray)) {
      targetArray.forEach(relTarget => {
        if (relTarget.includes('*')) {
          // If wildcard target e.g. "./workflows/*", inspect base directory for index files
          const baseDir = path.resolve(workspaceRoot, relTarget.replace(/\*.*$/, ''));
          for (const ext of ['ts', 'js']) {
            const candidate = path.join(baseDir, `index.${ext}`);
            if (fs.existsSync(candidate)) {
              try {
                if (fs.statSync(candidate).isFile()) {
                  parseReExportsFromFile(candidate, reExportMap);
                }
              } catch (_) {}
            }
          }
          return;
        }

        const absTarget = path.resolve(workspaceRoot, relTarget);
        if (fs.existsSync(absTarget)) {
          try {
            if (fs.statSync(absTarget).isFile()) {
              parseReExportsFromFile(absTarget, reExportMap);
            }
          } catch (_) {}
        }
      });
    }
  });
  return reExportMap;
}

/**
 * Strips single-line and multi-line comments outside of strings and regexes safely
 * @param {string} src
 * @returns {string} Sanitized source code
 */
function stripCommentsSafe(src) {
  if (!src) return '';
  let result = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  const templateBraceDepth = [];

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    const nextChar = src[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      result += char;
      if (char === '\\') {
        if (nextChar !== undefined) {
          result += nextChar;
          i++;
        }
      } else if (stringChar === '`' && char === '$' && nextChar === '{') {
        result += nextChar;
        i++;
        templateBraceDepth.push(1);
        inString = false;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (templateBraceDepth.length > 0) {
      if (char === '{') {
        templateBraceDepth[templateBraceDepth.length - 1]++;
      } else if (char === '}') {
        templateBraceDepth[templateBraceDepth.length - 1]--;
        if (templateBraceDepth[templateBraceDepth.length - 1] === 0) {
          templateBraceDepth.pop();
          inString = true;
          stringChar = '`';
          result += char;
          continue;
        }
      }
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      result += char;
      continue;
    }

    result += char;
  }
  return result;
}

const stripComments = stripCommentsSafe;

/**
 * Masks string literals by replacing non-newline characters inside quotes with spaces
 * @param {string} src
 * @returns {string} Source with string contents masked
 */
function maskStringLiterals(src) {
  if (!src) return '';
  let result = '';
  let inString = false;
  let stringChar = '';
  const templateBraceDepth = [];

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    const nextChar = src[i + 1];

    if (inString) {
      if (char === '\\') {
        result += '  ';
        i++;
      } else if (stringChar === '`' && char === '$' && nextChar === '{') {
        result += '${';
        i++;
        templateBraceDepth.push(1);
        inString = false;
      } else if (char === stringChar) {
        inString = false;
        result += ' ';
      } else {
        result += (char === '\n') ? '\n' : ' ';
      }
      continue;
    }

    if (templateBraceDepth.length > 0) {
      if (char === '{') {
        templateBraceDepth[templateBraceDepth.length - 1]++;
      } else if (char === '}') {
        templateBraceDepth[templateBraceDepth.length - 1]--;
        if (templateBraceDepth[templateBraceDepth.length - 1] === 0) {
          templateBraceDepth.pop();
          inString = true;
          stringChar = '`';
          result += '}';
          continue;
        }
      }
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      result += ' ';
      continue;
    }

    result += char;
  }
  return result;
}

/**
 * Resolves a module identifier from an import source, respecting tsconfig paths and index files.
 * @param {string} importSource
 * @param {string} currentFilePath
 * @param {object} [tsConfigPaths={}]
 * @returns {string} Target module identifier or empty string if unresolvable/index
 */
function resolveModuleId(importSource, currentFilePath, tsConfigPaths = {}) {
  let targetModuleId = '';

  for (const aliasPattern of Object.keys(tsConfigPaths)) {
    const prefix = aliasPattern.replace(/\*$/, '');
    if (prefix && importSource.startsWith(prefix)) {
      const subPath = importSource.slice(prefix.length);
      if (subPath) {
        targetModuleId = path.basename(subPath, path.extname(subPath));
        if (targetModuleId === 'index') {
          const parentDir = path.basename(path.dirname(subPath));
          targetModuleId = (parentDir && parentDir !== '.') ? parentDir : path.basename(prefix);
        }
      } else {
        const targetArray = tsConfigPaths[aliasPattern];
        if (Array.isArray(targetArray) && targetArray[0]) {
          let base = path.basename(targetArray[0], path.extname(targetArray[0]));
          if (base === 'index' || base === '*') {
            base = path.basename(path.dirname(targetArray[0]));
          }
          targetModuleId = (base && base !== '.') ? base : path.basename(prefix);
        } else {
          targetModuleId = path.basename(prefix);
        }
      }
      break;
    }
  }

  if (!targetModuleId && importSource.startsWith('.')) {
    const dirOfFile = currentFilePath ? path.dirname(currentFilePath) : '.';
    const resolvedTarget = path.resolve(dirOfFile, importSource);
    targetModuleId = path.basename(resolvedTarget, path.extname(resolvedTarget));
    if (targetModuleId === 'index') {
      const parent = path.basename(path.dirname(resolvedTarget));
      targetModuleId = (parent && parent !== '.') ? parent : '';
    }
  }

  return (targetModuleId && targetModuleId !== '.' && targetModuleId !== 'index') ? targetModuleId : '';
}

/**
 * Builds dynamic fixture lookup map from fixtures directory
 * @param {string} fixturesDir
 * @param {object} [tsConfigPaths={}]
 * @returns {Map<string, string>}
 */
function buildFixtureLookupMap(fixturesDir, tsConfigPaths = {}) {
  const fixtureLookupMap = new Map();
  if (!fs.existsSync(fixturesDir)) {
    return fixtureLookupMap;
  }

  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true });
  const fixtureFiles = entries.filter(
    e => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.js')) && !e.name.endsWith('.d.ts') && !e.name.startsWith('.')
  ).map(e => e.name);

  for (const file of fixtureFiles) {
    const filePath = path.join(fixturesDir, file);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      continue;
    }

    const classToModuleMap = new Map();

    // Strip comments cleanly before parsing so comments cannot disrupt brace depth or import parsing
    const sanitizedContent = stripCommentsSafe(content);

    // 1. Scan fixture file imports via regex on sanitized content
    const importRegex = /import(?:\s+type)?\s+(?:(\w+)\s*,\s*)?(?:(\{[\s\S]*?\})|(\w+)|\*\s+as\s+(\w+))?\s*from\s*['"`]([^'"`]+)['"`]/g;
    let importMatch;
    while ((importMatch = importRegex.exec(sanitizedContent)) !== null) {
      const defaultImport = importMatch[1];
      const destructuredGroup = importMatch[2];
      const singleDefault = importMatch[3];
      const importSource = importMatch[5];

      if (!importSource || importSource.startsWith('@playwright/') || importSource === '@playwright/test') {
        continue;
      }

      const targetModuleId = resolveModuleId(importSource, filePath, tsConfigPaths);
      if (targetModuleId) {
        if (defaultImport) classToModuleMap.set(defaultImport, targetModuleId);
        if (singleDefault) classToModuleMap.set(singleDefault, targetModuleId);
        if (destructuredGroup) {
          const symbols = destructuredGroup.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
          symbols.forEach(sym => {
            const cleanSym = sym.replace(/^type\s+/, '').split(/\s+as\s+/);
            const localName = cleanSym[cleanSym.length - 1].trim();
            classToModuleMap.set(localName, targetModuleId);
          });
        }
      }
    }

    // 2. Scan for Scope Blocks and class instantiations across the entire file
    const tokenRegex = new RegExp(
      '\\b([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*:\\s*(?:' +
        'new\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:\\s*<[^>]*>)?\\s*\\(' +
        '|' +
        '(?:async\\s*)?(?:\\([\\s\\S]*?\\)|[a-zA-Z_$][a-zA-Z0-9_$]*)(?:\\s*:\\s*[\\w<>\\[\\]\\s|&,()]+)?\\s*=>\\s*\\{' +
        '|' +
        '\\{' +
      ')',
      'g'
    );

    const namedBracePositions = new Map();
    const colonInstantiations = new Map();

    let match;
    while ((match = tokenRegex.exec(sanitizedContent)) !== null) {
      const propName = match[1];
      const className = match[2];

      if (className) {
        const colonIdx = match.index + match[0].indexOf(':');
        colonInstantiations.set(colonIdx, { propName, className });
        continue;
      }

      const braceIdx = match.index + match[0].lastIndexOf('{');
      if (braceIdx !== -1) {
        namedBracePositions.set(braceIdx, propName);
      }
    }

    // 3. Single-pass Character Walk with Scope Stack Tracking (String-Aware)
    let currentDepth = 0;
    const scopeStack = [];
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < sanitizedContent.length; i++) {
      const char = sanitizedContent[i];

      if (inString) {
        if (char === '\\') {
          i++;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        inString = true;
        stringChar = char;
        continue;
      }

      if (char === '{') {
        currentDepth++;
        if (namedBracePositions.has(i)) {
          scopeStack.push({ name: namedBracePositions.get(i), depth: currentDepth });
        } else {
          scopeStack.push({ name: null, depth: currentDepth });
        }
      } else if (char === '}') {
        while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].depth >= currentDepth) {
          scopeStack.pop();
        }
        currentDepth--;
      } else if (char === ':' && colonInstantiations.has(i)) {
        const { propName, className } = colonInstantiations.get(i);
        if (classToModuleMap.has(className)) {
          const moduleId = classToModuleMap.get(className);
          const activePath = scopeStack.map(s => s.name).filter(Boolean);
          const fullChain = [...activePath, propName].join('.');
          fixtureLookupMap.set(fullChain, moduleId);
        }
      }
    }
  }

  return fixtureLookupMap;
}

/**
 * Extracts module imports from a file (supporting static imports and AST fixture calls)
 * @param {string} filePath
 * @param {boolean} [isTest=false]
 * @param {Map} [fixtureLookupMap=new Map()]
 * @param {string} [fixturesDir='']
 * @param {string} [optionalContent=null]
 * @param {object} [tsConfigPaths={}]
 * @param {Map} [reExportMap=new Map()]
 * @returns {Array<string>}
 */
function extractFileImports(
  filePath,
  isTest = false,
  fixtureLookupMap = new Map(),
  fixturesDir = '',
  optionalContent = null,
  tsConfigPaths = {},
  reExportMap = new Map()
) {
  let content = '';
  if (typeof optionalContent === 'string') {
    content = optionalContent;
  } else if (filePath && fs.existsSync(filePath)) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      return [];
    }
  } else {
    return [];
  }

  const importedModules = new Set();
  const sanitizedContent = stripCommentsSafe(content);
  const importRegex = /import(?:\s+type)?\s+(?:(\w+)\s*,\s*)?(?:(\{[\s\S]*?\})|(\w+)|\*\s+as\s+(\w+))?\s*from\s*['"`]([^'"`]+)['"`]/g;
  let match;

  while ((match = importRegex.exec(sanitizedContent)) !== null) {
    const defaultImport = match[1];
    const destructuredGroup = match[2];
    const singleDefault = match[3];
    const importPath = match[5];

    if (!importPath) continue;

    if (importPath.startsWith('@playwright/') || importPath === '@playwright/test') {
      continue;
    }

    if (fixturesDir && filePath) {
      const absTarget = path.resolve(path.dirname(filePath), importPath);
      const absFixturesDir = path.resolve(fixturesDir);
      if (absTarget.startsWith(absFixturesDir) || importPath.includes('fixtures/')) {
        continue;
      }
    }

    // Resolve re-exports from symbols
    if (defaultImport && reExportMap.has(defaultImport)) {
      importedModules.add(reExportMap.get(defaultImport));
    }
    if (singleDefault && reExportMap.has(singleDefault)) {
      importedModules.add(reExportMap.get(singleDefault));
    }
    if (destructuredGroup) {
      const symbols = destructuredGroup.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      symbols.forEach(sym => {
        const symName = sym.replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
        if (reExportMap.has(symName)) {
          importedModules.add(reExportMap.get(symName));
        }
      });
    }

    const targetModuleId = resolveModuleId(importPath, filePath, tsConfigPaths);
    if (targetModuleId && targetModuleId !== '.' && targetModuleId !== 'index') {
      importedModules.add(targetModuleId);
    }
  }

  if (isTest && fixtureLookupMap && fixtureLookupMap.size > 0) {
    const maskedContent = maskStringLiterals(sanitizedContent);
    const chainRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)+)\b/g;
    let chainMatch;
    while ((chainMatch = chainRegex.exec(maskedContent)) !== null) {
      const fullChain = chainMatch[1];
      const parts = fullChain.split('.');
      for (let i = 2; i <= parts.length; i++) {
        const subChain = parts.slice(0, i).join('.');
        if (fixtureLookupMap.has(subChain)) {
          importedModules.add(fixtureLookupMap.get(subChain));
        }
      }
    }
  }

  return Array.from(importedModules);
}

/**
 * Checks if a file entry is a valid source file for extraction
 * @param {string} fileName
 * @param {string} sectionType
 * @returns {boolean}
 */
function isValidSourceFile(fileName, sectionType) {
  if (fileName.startsWith('.') || fileName.startsWith('index.') || fileName.endsWith('.d.ts')) {
    return false;
  }
  if (!fileName.endsWith('.ts') && !fileName.endsWith('.js')) {
    return false;
  }
  if (sectionType === 'test' && !fileName.includes('.spec.')) {
    return false;
  }
  return true;
}

/**
 * Recursively collects source files within a directory
 * @param {string} dir
 * @param {string} sectionType
 * @returns {Array<string>}
 */
function collectFiles(dir, sectionType, results = []) {
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('index.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, sectionType, results);
    } else if (entry.isFile() && isValidSourceFile(entry.name, sectionType)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Directory Crawler with Explicit Subfolder Filter
 * @param {string} sectionDir
 * @param {Array<string>} allowedSubfolders
 * @param {string} sectionType
 * @returns {Array<string>}
 */
function getFiles(sectionDir, allowedSubfolders, sectionType) {
  const results = [];
  if (!fs.existsSync(sectionDir)) return results;

  // Scan root files in section directory
  const entries = fs.readdirSync(sectionDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && isValidSourceFile(entry.name, sectionType)) {
      results.push(path.join(sectionDir, entry.name));
    }
  }

  // Scan explicitly configured subfolders
  if (Array.isArray(allowedSubfolders)) {
    for (const subfolder of allowedSubfolders) {
      const subDirPath = path.join(sectionDir, subfolder);
      if (fs.existsSync(subDirPath)) {
        collectFiles(subDirPath, sectionType, results);
      }
    }
  }

  return results;
}

/**
 * Locates the class body opening brace outside of angle brackets (<...>) and strings
 * @param {string} src
 * @param {number} startIndex
 * @returns {number}
 */
function findClassBodyStart(src, startIndex) {
  let inAngle = 0;
  let inString = false;
  let stringChar = '';

  for (let i = startIndex; i < src.length; i++) {
    const char = src[i];

    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '<') {
      inAngle++;
    } else if (char === '>') {
      inAngle = Math.max(0, inAngle - 1);
    } else if (char === '{' && inAngle === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * File content parsing strategies
 * @param {string} filePathOrContent
 * @param {string} type
 * @param {string} [optionalContent=null]
 * @returns {Array<object>}
 */
function parseContent(filePathOrContent, type, optionalContent = null) {
  let content = '';
  if (typeof optionalContent === 'string') {
    content = optionalContent;
  } else if (typeof filePathOrContent === 'string') {
    if (!filePathOrContent.includes('\n') && fs.existsSync(filePathOrContent)) {
      try {
        if (fs.statSync(filePathOrContent).isFile()) {
          content = fs.readFileSync(filePathOrContent, 'utf8');
        } else {
          content = filePathOrContent;
        }
      } catch (_) {
        content = filePathOrContent;
      }
    } else {
      content = filePathOrContent;
    }
  }

  const items = [];
  const sanitizedContent = stripCommentsSafe(content);

  if (type === 'test') {
    // Matches test('name', ...), test.only('name', ...), test.skip('name', ...), test.fixme('name', ...), test.fail('name', ...), test.slow('name', ...)
    const testRegex = /\btest(?:\.(?:only|skip|fixme|fail|slow))?\s*\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
    let match;
    while ((match = testRegex.exec(sanitizedContent)) !== null) {
      items.push({ name: match[2].trim() });
    }
  } else if (type === 'functions') {
    // Matches export [default] [async] function[*] name(...) and export const/let name = (...) =>
    const funcRegex = /(?:export\s+(?:default\s+)?(?:async\s+)?function(?:\s*\*\s*|\s+)(\w+)|export\s+(?:const|let)\s+(\w+)(?:\s*:\s*(?:=>|[^=])+)?\s*=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*[\w<>\[\]\s|&,()]+)?\s*=>)/g;
    let match;
    while ((match = funcRegex.exec(sanitizedContent)) !== null) {
      const name = match[1] || match[2];
      if (name) {
        items.push({ name });
      }
    }
  } else if (type === 'class') {
    const classHeaderRegex = /export\s+(?:(?:default|abstract)\s+)*class\s+(\w+)/g;
    let classHeaderMatch;
    while ((classHeaderMatch = classHeaderRegex.exec(sanitizedContent)) !== null) {
      const className = classHeaderMatch[1];
      const bodyStart = findClassBodyStart(sanitizedContent, classHeaderMatch.index + classHeaderMatch[0].length);
      if (bodyStart !== -1) {
        let braceCount = 1;
        let bodyEnd = bodyStart + 1;
        let inString = false;
        let stringChar = '';

        while (bodyEnd < sanitizedContent.length && braceCount > 0) {
          const char = sanitizedContent[bodyEnd];
          if (inString) {
            if (char === '\\') {
              bodyEnd++;
            } else if (char === stringChar) {
              inString = false;
            }
          } else if (char === "'" || char === '"' || char === '`') {
            inString = true;
            stringChar = char;
          } else if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
          }
          bodyEnd++;
        }

        const classBody = sanitizedContent.slice(bodyStart + 1, bodyEnd - 1);
        const methods = extractClassMethods(classBody);
        items.push({
          name: className,
          methods: methods
        });
      }
    }
  }

  return items;
}

/**
 * Extracts depth-0 class methods
 * @param {string} classBody
 * @returns {Array<object>}
 */
function extractClassMethods(classBody) {
  const methods = [];
  let depth = 0;
  let parenDepth = 0;
  let inAngle = 0;
  let typeBraceDepth = 0;
  let hasAssignment = false;
  let currentHeader = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < classBody.length; i++) {
    const char = classBody[i];

    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '<') {
      inAngle++;
    } else if (char === '>') {
      inAngle = Math.max(0, inAngle - 1);
    }

    if (depth === 0 && parenDepth === 0 && inAngle === 0 && typeBraceDepth === 0 && char === '=') {
      hasAssignment = true;
    }

    if (char === '{') {
      if (inAngle > 0 || (depth === 0 && hasAssignment && !currentHeader.includes('=>'))) {
        typeBraceDepth++;
        currentHeader += char;
      } else {
        if (depth === 0) {
          parseAndPushMethod(currentHeader, methods);
          currentHeader = '';
          hasAssignment = false;
        }
        depth++;
      }
    } else if (char === '}') {
      if (typeBraceDepth > 0) {
        typeBraceDepth--;
        currentHeader += char;
      } else {
        depth--;
        if (depth === 0) {
          currentHeader = '';
          hasAssignment = false;
        }
      }
    } else if (depth === 0) {
      if (char === ';') {
        if (inAngle > 0 || typeBraceDepth > 0) {
          currentHeader += char;
        } else {
          // Handle abstract methods and concise body arrow methods terminating in ';'
          if (/\babstract\s+/.test(currentHeader) || currentHeader.includes('=>')) {
            parseAndPushMethod(currentHeader, methods);
          }
          currentHeader = '';
          hasAssignment = false;
        }
      } else if (char === '\n' && parenDepth === 0 && inAngle === 0 && typeBraceDepth === 0 && hasAssignment && !currentHeader.includes('=>')) {
        currentHeader = '';
        hasAssignment = false;
      } else {
        currentHeader += char;
      }
    }
  }

  return methods;
}

/**
 * Parses method signature and adds to methods array
 * @param {string} header
 * @param {Array<object>} methods
 */
function parseAndPushMethod(header, methods) {
  const cleanHeader = header.replace(/\s+/g, ' ').trim();
  if (!cleanHeader) return;

  if (/\bconstructor\s*\(/.test(cleanHeader)) return;
  if (/\b(if|for|while|switch|catch)\s*\(/.test(cleanHeader)) return;

  // 1. Detect Class Property Arrow Functions: methodName = async (...) =>
  if (cleanHeader.includes('=>')) {
    const arrowMatch = cleanHeader.match(
      /^\s*(?:(?:public|private|protected|readonly|static|override)\s+)*(\w+)\s*(?::\s*(?:=>|[^=])+)?\s*=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)/
    );
    if (arrowMatch) {
      const isAsync = /\b(async\s*\(|async\s*<|async\s*[a-zA-Z_$]|=(\s*)async\b)/.test(cleanHeader);
      const methodName = arrowMatch[1];

      if (!['constructor', 'if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'async'].includes(methodName)) {
        methods.push({ name: isAsync ? `async ${methodName}()` : `${methodName}()` });
        return;
      }
    }
  }

  // 2. Detect Standard & Abstract Methods: async methodName(...)
  const match = cleanHeader.match(
    /^\s*(?:(async)\s+)?(?:(?:public|private|protected|static|abstract|override|get|set)\s+)*(?:(async)\s+)?(?:\*\s*)?(\w+)\s*(?:<[^>]*>)?\s*\(/
  );
  if (match) {
    const isAsync = Boolean(match[1] || match[2]);
    const methodName = match[3];

    if (!['constructor', 'if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'async'].includes(methodName)) {
      const displayName = isAsync ? `async ${methodName}()` : `${methodName}()`;
      methods.push({ name: displayName });
    }
  }
}

/**
 * Formats token strings to Title Case with camelCase splitting
 * @param {string} str
 * @returns {string}
 */
function toTitleCase(str) {
  if (!str) return '';

  return str
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z\d])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Generates dd-mm-yy-hhmmss timestamp string
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function formatTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yy = String(date.getFullYear()).slice(-2);
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${dd}-${mm}-${yy}-${hh}${min}${ss}`;
}

/**
 * Atomically writes JSON data to a target path via a temporary file
 * @param {string} targetPath
 * @param {*} data
 */
function writeJsonAtomic(targetPath, data) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (_) {}
    throw err;
  }
}

/**
 * Main Processing logic for mining codebase architecture into snapshot JSON
 * @param {object} [options={}]
 * @returns {object} Execution summary { dataset, snapshotPath, indexPath, snapshotFilename, timestampStr }
 */
function runMiner(options = {}) {
  const workspaceRoot = options.workspaceRoot || process.env.VISUALIZER_WORKSPACE_ROOT || path.resolve(__dirname, '..');
  const configPath = options.configPath || process.env.VISUALIZER_CONFIG_PATH || path.join(__dirname, 'visualizer-config.json');
  const dataDir = options.dataDir || process.env.VISUALIZER_DATA_DIR || path.join(__dirname, 'data');
  const silent = Boolean(options.silent || process.env.VISUALIZER_SILENT === 'true');
  const writeFiles = options.writeFiles !== undefined ? options.writeFiles : (process.env.VISUALIZER_WRITE_FILES !== 'false');
  const logger = options.logger || (silent ? { log: () => {}, warn: () => {}, error: () => {} } : console);

  const config = loadConfig(configPath, logger);
  const tagMap = buildTagMap(config.tags);
  const tsConfigPaths = loadTsConfig(workspaceRoot, logger);
  const reExportMap = buildReExportMap(workspaceRoot, tsConfigPaths);

  const testsSection = config.scanConfig.find(s => s && s.type === 'test');
  const configuredFixturesDir = (testsSection && testsSection.fixturesDir) || './tests/fixtures';
  const absFixturesDir = path.resolve(workspaceRoot, configuredFixturesDir);

  logger.log(`[AST Scanner] Parsing fixtures in ${absFixturesDir}...`);
  const fixtureLookupMap = buildFixtureLookupMap(absFixturesDir, tsConfigPaths);
  logger.log(`[AST Scanner] Generated ${fixtureLookupMap.size} fixture mappings.`);

  const dataset = [];

  for (const section of config.scanConfig) {
    if (!section || !section.dir) continue;
    logger.log(`Scanning section: ${section.name} (dir: ${section.dir})`);

    const resolvedDir = path.resolve(workspaceRoot, section.dir);
    const files = getFiles(resolvedDir, section.subfolders, section.type);

    const laneMap = new Map();
    const metricsMap = new Map();

    for (const filePath of files) {
      const relativePath = path.relative(resolvedDir, filePath);
      const dirName = path.dirname(relativePath);
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const cleanBaseName = baseName.replace(/\.spec$/, '');

      const tokens = cleanBaseName.split('-');

      const firstToken = tokens[0] ? tokens[0].toLowerCase() : '';
      const isTagCandidate = /^tag[a-z0-9]{1,4}$/i.test(firstToken) && firstToken !== 'tag' && firstToken !== 'tags' && firstToken !== 'tagging';
      if (isTagCandidate && !tagMap.has(firstToken)) {
        logger.warn(`Warning: Skipping file ${filePath} with unconfigured tag prefix '${firstToken}'`);
        continue;
      }

      const fileTags = [];
      let tokenIndex = 0;

      while (tokenIndex < tokens.length) {
        const potentialTag = tokens[tokenIndex].toLowerCase();
        if (tagMap.has(potentialTag)) {
          const tagConfig = tagMap.get(potentialTag);
          fileTags.push(tagConfig.displayName);
          tokenIndex++;
        } else {
          break;
        }
      }

      const allowUntagged = section.allowUntagged ?? true;
      if (!allowUntagged && fileTags.length === 0) {
        logger.warn(`Warning: Skipping untagged file ${filePath}`);
        continue;
      }

      const remainingName = tokens.slice(tokenIndex).join('-');
      const visualTitle = toTitleCase(remainingName || cleanBaseName);

      const subfolderLabel = (dirName !== '.')
        ? dirName.replace(/\\/g, '/').split('/')[0].toUpperCase()
        : null;

      // Single synchronous file read per source file with error guard
      let fileContent;
      try {
        fileContent = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        logger.warn(`Warning: Could not read file ${filePath}: ${err.message}`);
        continue;
      }
      const parsedItems = parseContent(filePath, section.type, fileContent);
      const fileImports = extractFileImports(
        filePath,
        section.type === 'test',
        fixtureLookupMap,
        absFixturesDir,
        fileContent,
        tsConfigPaths,
        reExportMap
      );

      if (section.type === 'test') {
        const categoryTags = fileTags.map(t => {
          const found = tagMap.get(t.toLowerCase());
          return found ? found.displayName : t;
        });
        const categoryKey = categoryTags.join('::');
        const categoryLabel = categoryTags.join(' ');

        const currentMetric = metricsMap.get(categoryKey) || {
          label: categoryLabel,
          tags: categoryTags,
          count: 0,
          files: []
        };
        currentMetric.count += parsedItems.length;
        currentMetric.files.push({
          id: baseName,
          fileName: path.basename(filePath),
          title: visualTitle,
          subfolder: subfolderLabel || 'ROOT',
          count: parsedItems.length
        });
        metricsMap.set(categoryKey, currentMetric);
      }

      const moduleObj = {
        id: baseName,
        fileName: path.basename(filePath),
        title: visualTitle,
        tags: fileTags,
        imports: fileImports,
        items: parsedItems,
        itemType: section.type
      };

      const laneBadges = [];
      let groupKey = '';

      if (fileTags.length > 1) {
        fileTags.forEach(tag => {
          laneBadges.push({ type: 'tag', value: tag });
        });
        if (subfolderLabel) {
          laneBadges.push({ type: 'subfolder', value: subfolderLabel });
        }
        groupKey = `multi:${baseName}|${laneBadges.map(b => `${b.type}:${b.value}`).join('|')}`;
      } else if (fileTags.length === 1) {
        laneBadges.push({ type: 'tag', value: fileTags[0] });
        if (subfolderLabel) {
          laneBadges.push({ type: 'subfolder', value: subfolderLabel });
        }
        groupKey = laneBadges.map(b => `${b.type}:${b.value}`).join('|');
      } else {
        if (subfolderLabel) {
          laneBadges.push({ type: 'subfolder', value: subfolderLabel });
        }
        groupKey = laneBadges.map(b => `${b.type}:${b.value}`).join('|') || 'empty';
      }

      if (!laneMap.has(groupKey)) {
        laneMap.set(groupKey, {
          laneBadges: laneBadges,
          modules: []
        });
      }
      laneMap.get(groupKey).modules.push(moduleObj);
    }

    const lanesArray = Array.from(laneMap.values());
    const sectionIconPath = section.icon || (config.icons && config.icons.sections && config.icons.sections[section.name]) || '';

    dataset.push({
      title: section.name,
      folder: section.dir,
      description: section.description,
      icon: sectionIconPath,
      lanes: lanesArray,
      metrics: Array.from(metricsMap.values())
    });
  }

  const timestampStr = formatTimestamp();
  const snapshotFilename = `snapshot-${timestampStr}.json`;
  const snapshotPath = path.join(dataDir, snapshotFilename);
  const indexPath = path.join(dataDir, 'index.json');

  if (writeFiles) {
    writeJsonAtomic(snapshotPath, dataset);
    logger.log(`Snapshot saved to ${snapshotPath}`);

    let indexData = [];
    if (fs.existsSync(indexPath)) {
      try {
        indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      } catch (err) {
        logger.warn(`Warning: Could not parse index.json, creating fresh ledger: ${err.message}`);
        indexData = [];
      }
    }

    if (!Array.isArray(indexData)) {
      logger.warn('Warning: index.json root is not an array, initializing fresh ledger');
      indexData = [];
    }

    indexData.unshift({
      file: snapshotFilename,
      label: 'snapshot',
      timestamp: timestampStr
    });

    writeJsonAtomic(indexPath, indexData);
    logger.log(`Ledger index updated at ${indexPath}`);
  }

  return {
    dataset,
    snapshotPath,
    indexPath,
    snapshotFilename,
    timestampStr
  };
}

if (require.main === module) {
  try {
    runMiner();
  } catch (err) {
    console.error(`Error executing miner: ${err.message}`);
    process.exit(1);
  }
}
