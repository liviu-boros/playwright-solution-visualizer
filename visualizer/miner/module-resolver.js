'use strict';

const fs = require('fs');
const path = require('path');
const { scanJsTs, stripCommentsSafe } = require('./lexer');

/** @type {Array<string>} */
const CODE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];

/** @type {Array<string>} */
const PROBE_EXTS = [...CODE_EXTS, '.json'];

/** @type {Array<string>} */
const INDEX_CANDIDATES = ['index.ts', 'index.tsx', 'index.mts', 'index.js', 'index.jsx', 'index.mjs', 'index.cjs'];

/** @type {Record<string, Array<string>>} */
const JS_TS_EXT_MAP = {
  '.js': ['.ts', '.tsx', '.mts', '.cts', '.d.ts'],
  '.jsx': ['.tsx', '.ts', '.d.ts'],
  '.mjs': ['.mts', '.ts', '.d.ts'],
  '.cjs': ['.cts', '.ts', '.d.ts']
};

/**
 * Loads and validates visualizer-config.json.
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
 * Ingests tsconfig.json `compilerOptions.baseUrl` and `compilerOptions.paths` (supporting JSONC comments).
 * @param {string} workspaceRoot
 * @param {object} [logger=console]
 * @returns {{ baseUrl: string, hasBaseUrl: boolean, rawPaths: object, exactPaths: Map<string, Array<string>>, wildcardPaths: Array<object> }}
 */
function loadTsConfig(workspaceRoot, logger = console) {
  const tsConfigPath = path.join(workspaceRoot, 'tsconfig.json');
  const exactPaths = new Map();
  const wildcardPaths = [];
  let rawPaths = {};
  let baseUrl = workspaceRoot;
  let hasBaseUrl = false;

  if (fs.existsSync(tsConfigPath)) {
    try {
      const raw = fs.readFileSync(tsConfigPath, 'utf8');
      const sanitized = stripCommentsSafe(raw);
      const tsConfig = JSON.parse(sanitized);
      const opts = tsConfig && tsConfig.compilerOptions ? tsConfig.compilerOptions : {};
      if (opts.baseUrl) {
        hasBaseUrl = true;
        baseUrl = path.resolve(workspaceRoot, opts.baseUrl);
      }
      if (opts.paths && typeof opts.paths === 'object') {
        rawPaths = opts.paths;
        for (const [pattern, targets] of Object.entries(opts.paths)) {
          if (!Array.isArray(targets) || targets.length === 0) continue;
          const starIdx = pattern.indexOf('*');
          if (starIdx === -1) {
            exactPaths.set(pattern, targets);
          } else {
            wildcardPaths.push({
              prefix: pattern.slice(0, starIdx),
              suffix: pattern.slice(starIdx + 1),
              targets
            });
          }
        }
        wildcardPaths.sort((a, b) => (b.prefix.length - a.prefix.length) || (b.suffix.length - a.suffix.length));
      }
    } catch (err) {
      logger.warn(`Warning: Could not parse tsconfig.json: ${err.message}`);
    }
  }

  return {
    baseUrl,
    hasBaseUrl,
    rawPaths,
    exactPaths,
    wildcardPaths
  };
}

/**
 * Builds a lowercase tag lookup map (`tag.name.toLowerCase() -> tagConfig`).
 * @param {Array<object>} [tags=[]]
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
 * Checks whether `targetPath` points to a regular file on disk without throwing.
 * @param {string} targetPath
 * @returns {boolean}
 */
function isRegularFile(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  try {
    return fs.statSync(targetPath).isFile();
  } catch (_) {
    return false;
  }
}

/**
 * Extracts direct exported symbol names from a module token list (used for wildcard barrel re-exports).
 * @param {Array<object>} tokens
 * @returns {Set<string>}
 */
function extractExportedSymbolNames(tokens) {
  const exported = new Set();
  let braceDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.type === 'punct') {
      if (tok.value === '{') braceDepth++;
      else if (tok.value === '}') braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (braceDepth !== 0 || tok.type !== 'ident' || tok.value !== 'export') continue;

    let j = i + 1;
    let sawDefault = false;
    while (tokens[j] && tokens[j].type === 'ident' && ['default', 'declare', 'abstract', 'async'].includes(tokens[j].value)) {
      if (tokens[j].value === 'default') {
        exported.add('default');
        sawDefault = true;
      }
      j++;
    }

    if (
      tokens[j] &&
      tokens[j].type === 'ident' &&
      ['function', 'class', 'const', 'let', 'var', 'interface', 'type', 'enum'].includes(tokens[j].value)
    ) {
      if (tokens[j].value === 'type' && tokens[j + 1] && tokens[j + 1].type === 'punct' && tokens[j + 1].value === '{') {
        j++;
      } else {
        if (tokens[j].value === 'const' && tokens[j + 1] && tokens[j + 1].type === 'ident' && tokens[j + 1].value === 'enum') {
          j++;
        }
        j++;
        if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '*') j++;
        if (tokens[j] && tokens[j].type === 'ident') {
          exported.add(tokens[j].value);
        }
        continue;
      }
    } else if (sawDefault && tokens[j] && tokens[j].type === 'ident' && tokens[j].value === 'interface') {
      j++;
      if (tokens[j] && tokens[j].type === 'ident') exported.add(tokens[j].value);
      continue;
    }

    if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '{') {
      let k = j + 1;
      const items = [];
      while (k < tokens.length && !(tokens[k].type === 'punct' && tokens[k].value === '}')) {
        if (tokens[k].type === 'ident' && tokens[k].value === 'type' && tokens[k + 1] && tokens[k + 1].type === 'ident' && tokens[k + 1].value !== 'as') {
          k++;
        }
        if (tokens[k] && tokens[k].type === 'ident') {
          let name = tokens[k].value;
          k++;
          if (tokens[k] && tokens[k].type === 'ident' && tokens[k].value === 'as' && tokens[k + 1] && tokens[k + 1].type === 'ident') {
            name = tokens[k + 1].value;
            k += 2;
          }
          items.push(name);
        } else {
          k++;
        }
        if (tokens[k] && tokens[k].type === 'punct' && tokens[k].value === ',') k++;
      }
      const afterBrace = tokens[k + 1];
      if (!afterBrace || !(afterBrace.type === 'ident' && afterBrace.value === 'from')) {
        items.forEach(item => exported.add(item));
      }
    }
  }

  return exported;
}

/**
 * Resolves workspace import paths, TypeScript path aliases, cached file token streams, and per-file re-export graphs.
 */
class ModuleResolver {
  /**
   * Creates a workspace module and re-export resolver.
   * @param {string} workspaceRoot
   * @param {object} [tsConfigInfo={}]
   */
  constructor(workspaceRoot, tsConfigInfo = {}) {
    /** @type {string} */
    this.workspaceRoot = workspaceRoot ? path.resolve(workspaceRoot) : '';
    /** @type {object} */
    this.tsConfigInfo = tsConfigInfo || {};
    /** @type {Map<string, Array<object>>} */
    this.fileTokenCache = new Map();
    /** @type {Map<string, object>} */
    this.reExportCache = new Map();
  }

  /**
   * Converts an absolute workspace file path into a normalized workspace-relative ID without its code extension.
   * @param {string} absFilePath
   * @returns {string}
   */
  toWorkspaceId(absFilePath) {
    const rel = path.relative(this.workspaceRoot, absFilePath).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) return '';
    if (/\.d\.ts$/i.test(rel)) return rel.replace(/\.ts$/i, '');
    const ext = path.extname(rel).toLowerCase();
    if (CODE_EXTS.includes(ext)) {
      return rel.slice(0, -ext.length);
    }
    return rel;
  }

  /**
   * Probes extension and index candidates on disk for a candidate filesystem path inside the workspace.
   * @param {string} candidateAbs
   * @returns {string} Resolved absolute file path or ''
   */
  probeWorkspaceFile(candidateAbs) {
    const relToRoot = path.relative(this.workspaceRoot, candidateAbs);
    if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot) || /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(relToRoot)) {
      return '';
    }

    if (isRegularFile(candidateAbs)) {
      return candidateAbs;
    }

    const candidateExt = path.extname(candidateAbs).toLowerCase();
    if (JS_TS_EXT_MAP[candidateExt]) {
      const stem = candidateAbs.slice(0, -candidateExt.length);
      for (const tsExt of JS_TS_EXT_MAP[candidateExt]) {
        if (isRegularFile(stem + tsExt)) return stem + tsExt;
      }
    }

    for (const ext of PROBE_EXTS) {
      if (isRegularFile(candidateAbs + ext)) return candidateAbs + ext;
    }

    for (const indexFile of INDEX_CANDIDATES) {
      const idxCandidate = path.join(candidateAbs, indexFile);
      if (isRegularFile(idxCandidate)) return idxCandidate;
    }

    return '';
  }

  /**
   * Resolves an import specifier to a workspace file path and normalized workspace ID.
   * @param {string} importSource
   * @param {string} currentFilePath
   * @returns {{ absPath: string, workspaceId: string, isIndexFile: boolean, foundOnDisk: boolean }|null}
   */
  resolveImportTarget(importSource, currentFilePath) {
    if (!importSource || importSource.startsWith('@playwright/') || importSource === '@playwright/test') {
      return null;
    }

    const baseUrl = this.tsConfigInfo.baseUrl || this.workspaceRoot;
    const candidateAbsPaths = [];
    let matchedLocalPattern = false;

    if (this.tsConfigInfo.exactPaths && this.tsConfigInfo.exactPaths.has(importSource)) {
      matchedLocalPattern = true;
      for (const target of this.tsConfigInfo.exactPaths.get(importSource)) {
        candidateAbsPaths.push(path.resolve(baseUrl, target));
      }
    } else if (this.tsConfigInfo.wildcardPaths) {
      for (const entry of this.tsConfigInfo.wildcardPaths) {
        if (importSource.startsWith(entry.prefix) && importSource.endsWith(entry.suffix) && importSource.length >= entry.prefix.length + entry.suffix.length) {
          matchedLocalPattern = true;
          const wildcardVal = importSource.slice(entry.prefix.length, importSource.length - entry.suffix.length);
          for (const target of entry.targets) {
            candidateAbsPaths.push(path.resolve(baseUrl, target.replace('*', wildcardVal)));
          }
          break;
        }
      }
    }

    if (!matchedLocalPattern) {
      if (importSource.startsWith('./') || importSource.startsWith('../') || importSource === '.' || importSource === '..') {
        matchedLocalPattern = true;
        const dirOfFile = currentFilePath ? path.dirname(currentFilePath) : this.workspaceRoot;
        candidateAbsPaths.push(path.resolve(dirOfFile, importSource));
      } else if (importSource.startsWith('/')) {
        matchedLocalPattern = true;
        candidateAbsPaths.push(path.resolve(this.workspaceRoot, importSource.slice(1)));
      } else if (this.tsConfigInfo.hasBaseUrl) {
        const baseCandidate = path.resolve(baseUrl, importSource);
        const probedBase = this.probeWorkspaceFile(baseCandidate);
        if (probedBase) {
          const workspaceId = this.toWorkspaceId(probedBase);
          return {
            absPath: probedBase,
            workspaceId,
            isIndexFile: /^index\./i.test(path.basename(probedBase)),
            foundOnDisk: true
          };
        }
      }
    }

    if (!matchedLocalPattern || candidateAbsPaths.length === 0) {
      return null;
    }

    for (const candidateAbs of candidateAbsPaths) {
      const probed = this.probeWorkspaceFile(candidateAbs);
      if (probed) {
        const workspaceId = this.toWorkspaceId(probed);
        if (!workspaceId) continue;
        return {
          absPath: probed,
          workspaceId,
          isIndexFile: /^index\./i.test(path.basename(probed)),
          foundOnDisk: true
        };
      }
    }

    const fallbackAbs = candidateAbsPaths[0];
    let fallbackId = this.toWorkspaceId(fallbackAbs);
    if (!fallbackId) return null;
    const fallbackBase = path.basename(fallbackId);
    if (fallbackBase === 'index') {
      const parentId = path.dirname(fallbackId).replace(/\\/g, '/');
      fallbackId = parentId && parentId !== '.' ? parentId : fallbackId;
    }
    return {
      absPath: fallbackAbs,
      workspaceId: fallbackId,
      isIndexFile: fallbackBase === 'index',
      foundOnDisk: false
    };
  }

  /**
   * Returns cached lexical tokens for an on-disk file path.
   * @param {string} absFilePath
   * @returns {Array<object>}
   */
  getFileTokens(absFilePath) {
    if (this.fileTokenCache.has(absFilePath)) {
      return this.fileTokenCache.get(absFilePath);
    }
    let tokens = [];
    try {
      const content = fs.readFileSync(absFilePath, 'utf8');
      tokens = scanJsTs(content, { collectTokens: true, collectSpans: false }).tokens;
    } catch (_) {
      tokens = [];
    }
    this.fileTokenCache.set(absFilePath, tokens);
    return tokens;
  }

  /**
   * Parses ES import statements from a token stream and resolves their targets.
   * @param {Array<object>} tokens
   * @param {string} currentFilePath
   * @returns {Array<object>}
   */
  parseImports(tokens, currentFilePath) {
    const imports = [];
    let i = 0;

    while (i < tokens.length) {
      const tok = tokens[i];
      const isTopLevelStmtStart = (i === 0 || (tokens[i - 1].type === 'punct' && (tokens[i - 1].value === ';' || tokens[i - 1].value === '}' || tokens[i - 1].value === '{')));
      if (tok.type === 'ident' && tok.value === 'import' && isTopLevelStmtStart) {
        let j = i + 1;
        if (j < tokens.length && tokens[j].type === 'punct' && tokens[j].value === '(') {
          i = j + 1;
          continue;
        }

        if (j < tokens.length && tokens[j].type === 'ident' && tokens[j].value === 'type') {
          const afterType = tokens[j + 1];
          if (afterType && (afterType.type === 'ident' || (afterType.type === 'punct' && (afterType.value === '{' || afterType.value === '*')))) {
            j++;
          }
        }

        if (j < tokens.length && tokens[j].type === 'string') {
          const importSource = tokens[j].value;
          imports.push({
            importSource,
            defaultLocal: '',
            namespaceLocal: '',
            namedSpecs: [],
            target: this.resolveImportTarget(importSource, currentFilePath)
          });
          i = j + 1;
          continue;
        }

        let defaultLocal = '';
        let namespaceLocal = '';
        const namedSpecs = [];

        if (j < tokens.length && tokens[j].type === 'ident' && tokens[j].value !== 'from') {
          defaultLocal = tokens[j].value;
          j++;
          if (j < tokens.length && tokens[j].type === 'punct' && tokens[j].value === ',') {
            j++;
          }
        }

        if (j < tokens.length && tokens[j].type === 'punct' && tokens[j].value === '*') {
          if (tokens[j + 1] && tokens[j + 1].type === 'ident' && tokens[j + 1].value === 'as' && tokens[j + 2] && tokens[j + 2].type === 'ident') {
            namespaceLocal = tokens[j + 2].value;
            j += 3;
          }
        } else if (j < tokens.length && tokens[j].type === 'punct' && tokens[j].value === '{') {
          j++;
          while (j < tokens.length && !(tokens[j].type === 'punct' && tokens[j].value === '}')) {
            if (tokens[j].type === 'ident' && tokens[j].value === 'type' && tokens[j + 1] && tokens[j + 1].type === 'ident' && tokens[j + 1].value !== 'as') {
              j++;
            }
            if (tokens[j] && tokens[j].type === 'ident') {
              const imported = tokens[j].value;
              let local = imported;
              j++;
              if (tokens[j] && tokens[j].type === 'ident' && tokens[j].value === 'as' && tokens[j + 1] && tokens[j + 1].type === 'ident') {
                local = tokens[j + 1].value;
                j += 2;
              }
              namedSpecs.push({ imported, local });
            } else {
              j++;
            }
            if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === ',') {
              j++;
            }
          }
          if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '}') {
            j++;
          }
        }

        if (j < tokens.length && tokens[j].type === 'ident' && tokens[j].value === 'from' && tokens[j + 1] && tokens[j + 1].type === 'string') {
          const importSource = tokens[j + 1].value;
          imports.push({
            importSource,
            defaultLocal,
            namespaceLocal,
            namedSpecs,
            target: this.resolveImportTarget(importSource, currentFilePath)
          });
          i = j + 2;
          continue;
        }
      }
      i++;
    }

    return imports;
  }

  /**
   * Builds and caches per-file re-export symbol maps (`symbolName -> Set<targetWorkspaceId>`).
   * @param {string} absFilePath
   * @param {Set<string>} [visiting=new Set()]
   * @returns {{ symbolMap: Map<string, Set<string>>, allTargets: Set<string>, hasLocalExports: boolean, hasReExports: boolean }}
   */
  getFileReExports(absFilePath, visiting = new Set()) {
    if (this.reExportCache.has(absFilePath)) {
      return this.reExportCache.get(absFilePath);
    }
    const empty = { symbolMap: new Map(), allTargets: new Set(), hasLocalExports: false, hasReExports: false };
    if (!absFilePath || visiting.has(absFilePath) || !isRegularFile(absFilePath)) {
      return empty;
    }

    visiting.add(absFilePath);
    const tokens = this.getFileTokens(absFilePath);
    const symbolMap = new Map();
    const allTargets = new Set();
    const localExports = extractExportedSymbolNames(tokens);
    const hasLocalExports = localExports.size > 0;
    let hasReExports = false;

    const addSymbolTarget = (sym, targetId) => {
      if (!sym || !targetId) return;
      if (!symbolMap.has(sym)) symbolMap.set(sym, new Set());
      symbolMap.get(sym).add(targetId);
      allTargets.add(targetId);
    };

    let braceDepth = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === 'punct') {
        if (tok.value === '{') braceDepth++;
        else if (tok.value === '}') braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (braceDepth !== 0 || tok.type !== 'ident' || tok.value !== 'export') continue;

      let j = i + 1;
      if (tokens[j] && tokens[j].type === 'ident' && tokens[j].value === 'type') {
        j++;
      }

      if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '*') {
        let nsAlias = '';
        j++;
        if (tokens[j] && tokens[j].type === 'ident' && tokens[j].value === 'as' && tokens[j + 1] && tokens[j + 1].type === 'ident') {
          nsAlias = tokens[j + 1].value;
          j += 2;
        }
        if (tokens[j] && tokens[j].type === 'ident' && tokens[j].value === 'from' && tokens[j + 1] && tokens[j + 1].type === 'string') {
          const target = this.resolveImportTarget(tokens[j + 1].value, absFilePath);
          if (target && target.foundOnDisk) {
            hasReExports = true;
            const subReExports = this.getFileReExports(target.absPath, visiting);
            if (nsAlias) {
              addSymbolTarget(nsAlias, target.workspaceId);
            } else {
              const subTokens = this.getFileTokens(target.absPath);
              const directSyms = extractExportedSymbolNames(subTokens);
              for (const sym of directSyms) {
                if (sym !== 'default') addSymbolTarget(sym, target.workspaceId);
              }
              for (const [subSym, subTargets] of subReExports.symbolMap.entries()) {
                if (subSym !== 'default') {
                  subTargets.forEach(t => addSymbolTarget(subSym, t));
                }
              }
            }
          }
          i = j + 1;
        }
        continue;
      }

      if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '{') {
        let k = j + 1;
        const specifiers = [];
        while (k < tokens.length && !(tokens[k].type === 'punct' && tokens[k].value === '}')) {
          if (tokens[k].type === 'ident' && tokens[k].value === 'type' && tokens[k + 1] && tokens[k + 1].type === 'ident' && tokens[k + 1].value !== 'as') {
            k++;
          }
          if (tokens[k] && tokens[k].type === 'ident') {
            const origName = tokens[k].value;
            let exportedName = origName;
            k++;
            if (tokens[k] && tokens[k].type === 'ident' && tokens[k].value === 'as' && tokens[k + 1] && tokens[k + 1].type === 'ident') {
              exportedName = tokens[k + 1].value;
              k += 2;
            }
            specifiers.push({ origName, exportedName });
          } else {
            k++;
          }
          if (tokens[k] && tokens[k].type === 'punct' && tokens[k].value === ',') k++;
        }

        if (tokens[k] && tokens[k].type === 'punct' && tokens[k].value === '}' && tokens[k + 1] && tokens[k + 1].type === 'ident' && tokens[k + 1].value === 'from' && tokens[k + 2] && tokens[k + 2].type === 'string') {
          const target = this.resolveImportTarget(tokens[k + 2].value, absFilePath);
          if (target) {
            hasReExports = true;
            const subReExports = target.foundOnDisk ? this.getFileReExports(target.absPath, visiting) : empty;
            for (const spec of specifiers) {
              if (subReExports.symbolMap.has(spec.origName)) {
                subReExports.symbolMap.get(spec.origName).forEach(t => addSymbolTarget(spec.exportedName, t));
              } else {
                addSymbolTarget(spec.exportedName, target.workspaceId);
              }
            }
          }
          i = k + 2;
        }
      }
    }

    visiting.delete(absFilePath);
    const entry = { symbolMap, allTargets, hasLocalExports, hasReExports };
    this.reExportCache.set(absFilePath, entry);
    return entry;
  }

  /**
   * Resolves the primary target workspace ID for a symbol imported through a module or barrel re-export.
   * @param {object|null} reExports
   * @param {string} symbolName
   * @param {string} fallbackWorkspaceId
   * @returns {string}
   */
  resolveFirstSymbolTarget(reExports, symbolName, fallbackWorkspaceId) {
    if (reExports && reExports.symbolMap.has(symbolName)) {
      const first = Array.from(reExports.symbolMap.get(symbolName))[0];
      return first || '';
    }
    return fallbackWorkspaceId;
  }
}

module.exports = {
  CODE_EXTS,
  PROBE_EXTS,
  INDEX_CANDIDATES,
  JS_TS_EXT_MAP,
  loadConfig,
  loadTsConfig,
  buildTagMap,
  isRegularFile,
  extractExportedSymbolNames,
  ModuleResolver
};
