const fs = require('fs');
const path = require('path');

// 1. Ingest Configuration
const CONFIG_PATH = path.join(__dirname, 'visualizer-config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`Error: Configuration file not found at ${CONFIG_PATH}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// Build Tag Lookup Map (name.toLowerCase() -> tag config object)
const TAG_MAP = new Map();
if (Array.isArray(config.tags)) {
  config.tags.forEach(tag => {
    if (tag.name) {
      TAG_MAP.set(tag.name.toLowerCase(), tag);
    }
  });
}

// Ingest tsconfig.json & Build Re-Export Lookup Map
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const TSCONFIG_PATH = path.join(WORKSPACE_ROOT, 'tsconfig.json');
let tsConfigPaths = {};
const reExportMap = new Map(); // functionName -> sourceModuleId

if (fs.existsSync(TSCONFIG_PATH)) {
  try {
    const tsConfig = JSON.parse(fs.readFileSync(TSCONFIG_PATH, 'utf8'));
    if (tsConfig.compilerOptions && tsConfig.compilerOptions.paths) {
      tsConfigPaths = tsConfig.compilerOptions.paths;
    }
  } catch (err) {
    console.warn(`Warning: Could not parse tsconfig.json: ${err.message}`);
  }
}

// Build re-export map for index files defined in tsconfig paths
Object.keys(tsConfigPaths).forEach(alias => {
  const targetArray = tsConfigPaths[alias];
  if (Array.isArray(targetArray)) {
    targetArray.forEach(relTarget => {
      const absTarget = path.resolve(WORKSPACE_ROOT, relTarget);
      if (fs.existsSync(absTarget) && fs.statSync(absTarget).isFile()) {
        const indexContent = fs.readFileSync(absTarget, 'utf8');
        // Match export { func1, func2 } from "./subfile"
        const reExportRegex = /export\s+\{([^}]+)\}\s+from\s+['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = reExportRegex.exec(indexContent)) !== null) {
          const rawExports = match[1];
          const subfileRel = match[2];
          const subfileBase = path.basename(subfileRel, path.extname(subfileRel));
          const exportsList = rawExports.split(',').map(s => s.trim()).filter(Boolean);
          exportsList.forEach(expName => {
            // Handle 'export { func as aliasFunc }'
            const parts = expName.split(/\s+as\s+/);
            const exportedName = parts[parts.length - 1].trim();
            reExportMap.set(exportedName, subfileBase);
          });
        }
      }
    });
  }
});

// Extract module imports from a file
function extractFileImports(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const importedModules = new Set();

  // Match import statements: import { ... } from '...' OR import name from '...'
  const importRegex = /import\s+(?:(\{[\s\S]*?\})|(\w+)|\*\s+as\s+(\w+))?\s*from\s*['"`]([^'"`]+)['"`]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const destructuredGroup = match[1];
    const importPath = match[4];

    if (!importPath) continue;

    // Ignore external packages
    if (importPath.startsWith('@playwright/') || importPath === '@playwright/test') {
      continue;
    }

    // Check if import matches a known tsconfig path alias
    let matchedAlias = false;

    // Check exact alias matches
    if (tsConfigPaths[importPath]) {
      matchedAlias = true;
      if (destructuredGroup) {
        // Parse destructured symbols
        const symbols = destructuredGroup.replace(/[{}]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        symbols.forEach(sym => {
          const symName = sym.split(/\s+as\s+/)[0].trim();
          if (reExportMap.has(symName)) {
            importedModules.add(reExportMap.get(symName));
          }
        });
      }
    } else {
      // Check wildcard alias matches
      for (const aliasPattern of Object.keys(tsConfigPaths)) {
        const prefix = aliasPattern.replace(/\*$/, '');
        if (prefix && importPath.startsWith(prefix)) {
          matchedAlias = true;
          const subPath = importPath.slice(prefix.length);
          const targetModuleId = path.basename(subPath, path.extname(subPath));
          if (targetModuleId) {
            importedModules.add(targetModuleId);
          }
          break;
        }
      }
    }

    // If relative path import
    if (!matchedAlias && importPath.startsWith('.')) {
      const resolvedTarget = path.resolve(path.dirname(filePath), importPath);
      const targetModuleId = path.basename(resolvedTarget, path.extname(resolvedTarget));
      if (targetModuleId && targetModuleId !== 'index') {
        importedModules.add(targetModuleId);
      }
    }
  }

  return Array.from(importedModules);
}



// Directory Crawler with Explicit Subfolder Filter
function getFiles(sectionDir, allowedSubfolders, sectionType) {
  let results = [];
  if (!fs.existsSync(sectionDir)) return results;

  // Scan root files in section directory
  const list = fs.readdirSync(sectionDir);
  list.forEach(file => {
    if (file.startsWith('index.') || file.startsWith('.') || file.endsWith('.d.ts')) return;
    const filePath = path.join(sectionDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isDirectory() && (file.endsWith('.ts') || file.endsWith('.js'))) {
      if (sectionType === 'test' && !file.includes('.spec.')) return;
      results.push(filePath);
    }
  });

  // Scan explicitly configured subfolders
  if (Array.isArray(allowedSubfolders)) {
    allowedSubfolders.forEach(subfolder => {
      const subDirPath = path.join(sectionDir, subfolder);
      if (fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()) {
        results = results.concat(collectFilesRecursively(subDirPath, sectionType));
      }
    });
  }

  return results;
}

function collectFilesRecursively(dir, sectionType) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file.startsWith('index.') || file.startsWith('.') || file.endsWith('.d.ts')) return;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(collectFilesRecursively(filePath, sectionType));
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      if (sectionType === 'test' && !file.includes('.spec.')) return;
      results.push(filePath);
    }
  });
  return results;
}

// File content parsing strategies
function parseContent(filePath, type) {
  const content = fs.readFileSync(filePath, 'utf8');
  const items = [];
  let match;

  if (type === 'test') {
    // Capture test('name', ...) or test("name", ...), test(`name`, ...)
    // Exclude setup/teardown hooks (beforeAll, beforeEach, afterAll, afterEach)
    const testRegex = /test\s*\(\s*['"`](.*?)['"`]/g;
    const lines = content.split(/\r?\n/);
    lines.forEach(line => {
      // Skip setup/teardown hook lines
      if (
        line.includes('.beforeAll') ||
        line.includes('.beforeEach') ||
        line.includes('.afterAll') ||
        line.includes('.afterEach')
      ) {
        return;
      }

      let localMatch;
      // Reset regex index for this line
      testRegex.lastIndex = 0;
      while ((localMatch = testRegex.exec(line)) !== null) {
        items.push({ name: localMatch[1] });
      }
    });
  }
  else if (type === 'functions') {
    // Capture exported function declarations
    const funcRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    while ((match = funcRegex.exec(content)) !== null) {
      items.push({ name: match[1] });
    }
  }
  else if (type === 'class') {
    // Capture export class ClassName blocks and extract depth-0 class methods
    const classHeaderRegex = /export\s+class\s+(\w+)/g;
    let classHeaderMatch;
    while ((classHeaderMatch = classHeaderRegex.exec(content)) !== null) {
      const className = classHeaderMatch[1];
      const bodyStart = content.indexOf('{', classHeaderMatch.index);
      if (bodyStart !== -1) {
        let braceCount = 1;
        let bodyEnd = bodyStart + 1;
        while (bodyEnd < content.length && braceCount > 0) {
          if (content[bodyEnd] === '{') braceCount++;
          else if (content[bodyEnd] === '}') braceCount--;
          bodyEnd++;
        }
        const classBody = content.slice(bodyStart + 1, bodyEnd - 1);
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

// Helper to extract top-level methods at class depth 0
function extractClassMethods(classBody) {
  const methods = [];
  let depth = 0;
  let currentHeader = '';
  let inSingleLineComment = false;
  let inMultiLineComment = false;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < classBody.length; i++) {
    const char = classBody[i];
    const nextChar = classBody[i + 1];

    if (inSingleLineComment) {
      if (char === '\n') inSingleLineComment = false;
      continue;
    }
    if (inMultiLineComment) {
      if (char === '*' && nextChar === '/') {
        inMultiLineComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleLineComment = true;
      i++;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inMultiLineComment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        parseAndPushMethod(currentHeader, methods);
        currentHeader = '';
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        currentHeader = '';
      }
    } else if (depth === 0) {
      if (char === ';') {
        currentHeader = '';
      } else {
        currentHeader += char;
      }
    }
  }

  return methods;
}

function parseAndPushMethod(header, methods) {
  const cleanHeader = header.replace(/\s+/g, ' ').trim();
  if (!cleanHeader) return;

  if (/\bconstructor\s*\(/.test(cleanHeader)) return;
  if (/\b(if|for|while|switch|catch)\s*\(/.test(cleanHeader)) return;

  const match = cleanHeader.match(/(?:(async)\s+)?(?:(?:public|private|protected|static|get|set)\s+)*(?:(async)\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)/);
  if (match) {
    const isAsync = Boolean(match[1] || match[2]);
    const methodName = match[3];

    if (['constructor', 'if', 'else', 'for', 'while', 'switch', 'catch', 'return'].includes(methodName)) {
      return;
    }

    const displayName = isAsync ? `async ${methodName}()` : `${methodName}()`;
    methods.push({ name: displayName });
  }
}

// Helper to format Title Case
function toTitleCase(str) {
  return str
    .split(/[-_]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Main Processing logic
function runMiner() {
  const dataset = [];

  config.scanConfig.forEach(section => {
    console.log(`Scanning section: ${section.name} (dir: ${section.dir})`);

    // Resolve absolute path of scanning directory relative to the config file/workspace root
    // Since sync-visualizer.js runs in /visualizer, section.dir (e.g. "./tests") is relative to workspace root.
    // The workspace root is the parent of /visualizer (i.e. __dirname/..)
    const resolvedDir = path.resolve(__dirname, '..', section.dir);
    const files = getFiles(resolvedDir, section.subfolders, section.type);

    const laneMap = new Map();
    const metricsMap = new Map(); // For aggregating test counts per tag/folder

    files.forEach(filePath => {
      const relativePath = path.relative(resolvedDir, filePath);
      const dirName = path.dirname(relativePath);
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      // Remove .spec suffix from baseName before tokenizing for title calculation
      const cleanBaseName = baseName.replace(/\.spec$/, '');

      // Tokenization
      const tokens = cleanBaseName.split('-');

      // 1. Unconfigured Tag Prefix Guard
      const firstToken = tokens[0] ? tokens[0].toLowerCase() : '';
      if (firstToken.startsWith('tag') && !TAG_MAP.has(firstToken)) {
        console.warn(`Warning: Skipping file ${filePath} with unconfigured tag prefix '${firstToken}'`);
        return;
      }

      const fileTags = [];
      let tokenIndex = 0;

      // Extract accepted tags from start of filename using configured tags
      while (tokenIndex < tokens.length) {
        const potentialTag = tokens[tokenIndex].toLowerCase();
        if (TAG_MAP.has(potentialTag)) {
          const tagConfig = TAG_MAP.get(potentialTag);
          fileTags.push(tagConfig.displayName);
          tokenIndex++;
        } else {
          break;
        }
      }

      // Test Section Tag Enforcement
      if (section.type === 'test' && fileTags.length === 0) {
        console.warn(`Warning: Skipping untagged test file ${filePath}`);
        return;
      }


      // Format remaining tokens to Title Case for visual title
      const remainingName = tokens.slice(tokenIndex).join('-');
      const visualTitle = toTitleCase(remainingName || cleanBaseName);

      // Subfolder label calculation
      const subfolderLabel = (dirName !== '.')
        ? dirName.replace(/\\/g, '/').split('/')[0].toUpperCase()
        : null;


      // Parse file items and extracted module imports
      const parsedItems = parseContent(filePath, section.type);
      const fileImports = extractFileImports(filePath);

      // Aggregate metrics for tests per distinct tag category combination
      if (section.type === 'test') {
        const categoryTags = fileTags.map(t => {
          const found = TAG_MAP.get(t.toLowerCase());
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

      // Determine lane row groups:
      // - Multi-tag specs get their own dedicated section-lane displaying all assigned tags.
      // - Single-tag specs are grouped into section-lanes by tag + subfolder combination.
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
    });

    // Convert lane map to array
    const lanesArray = Array.from(laneMap.values());

    // Resolve section branding icon directly from section configuration
    const sectionIconPath = section.icon || (config.icons && config.icons.sections && config.icons.sections[section.name]) || '';


    dataset.push({
      title: section.name,
      folder: section.dir,
      description: section.description,
      icon: sectionIconPath,
      lanes: lanesArray,
      metrics: Array.from(metricsMap.values())
    });
  });

  // Write snapshot and update index ledger
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yy = String(now.getFullYear()).slice(-2);
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());

  const timestampStr = `${dd}-${mm}-${yy}-${hh}${min}${ss}`;
  const snapshotFilename = `snapshot-${timestampStr}.json`;
  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const snapshotPath = path.join(dataDir, snapshotFilename);
  fs.writeFileSync(snapshotPath, JSON.stringify(dataset, null, 2), 'utf8');
  console.log(`Snapshot saved to ${snapshotPath}`);

  // Ledger inversion processing
  const indexPath = path.join(dataDir, 'index.json');
  let indexData = [];
  if (fs.existsSync(indexPath)) {
    indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  }

  indexData.unshift({
    file: snapshotFilename,
    label: 'snapshot',
    timestamp: timestampStr
  });

  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`Ledger index updated at ${indexPath}`);
}

runMiner();
