'use strict';

const fs = require('fs');
const path = require('path');
const { parseContent } = require('./content-parser');

/**
 * Formats token strings to Title Case with camelCase and acronym boundary splitting.
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
 * Checks whether a filename is a valid non-hidden, non-index source file for `sectionType`.
 * @param {string} fileName
 * @param {string} sectionType
 * @returns {boolean}
 */
function isValidSourceFile(fileName, sectionType) {
  if (fileName.startsWith('.') || /^index\./i.test(fileName) || fileName.endsWith('.d.ts')) {
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
 * Checks whether a directory entry (or symlink to directory) resolves to a directory.
 * @param {string} parentDir
 * @param {fs.Dirent} entry
 * @returns {boolean}
 */
function isDirectoryEntry(parentDir, entry) {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      return fs.statSync(path.join(parentDir, entry.name)).isDirectory();
    } catch (_) {
      return false;
    }
  }
  return false;
}

/**
 * Resolves a configured relative subfolder path case-insensitively on disk while preserving real directory casing.
 * @param {string} baseDir
 * @param {string} relSubfolder
 * @returns {string}
 */
function resolveSubfolderCaseInsensitive(baseDir, relSubfolder) {
  const segments = String(relSubfolder || '').replace(/\\/g, '/').split('/').filter(Boolean);
  let current = baseDir;

  for (const seg of segments) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_) {
      return '';
    }
    const targetLower = seg.toLowerCase();
    const exactMatch = entries.find(e => e.name === seg && isDirectoryEntry(current, e));
    const matched = exactMatch || entries.find(e => e.name.toLowerCase() === targetLower && isDirectoryEntry(current, e));
    if (!matched) return '';
    current = path.join(current, matched.name);
  }

  return current;
}

/**
 * Recursively collects valid source files inside a directory.
 * @param {string} dir
 * @param {string} sectionType
 * @param {Array<string>} [results=[]]
 * @returns {Array<string>}
 */
function collectFiles(dir, sectionType, results = []) {
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || /^index\./i.test(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (isDirectoryEntry(dir, entry)) {
      collectFiles(fullPath, sectionType, results);
    } else if (entry.isFile() && isValidSourceFile(entry.name, sectionType)) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Collects source files excluded by section subfolder or filename filters for diagnostic skip warnings.
 * @param {string} dir
 * @param {Set<string>} includedSet
 * @param {import('./module-resolver').ModuleResolver} moduleResolver
 * @param {Map<string, string>} skippedModules
 */
function indexUnconfiguredSectionFiles(dir, includedSet, moduleResolver, skippedModules) {
  if (!fs.existsSync(dir)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (isDirectoryEntry(dir, entry)) {
      indexUnconfiguredSectionFiles(fullPath, includedSet, moduleResolver, skippedModules);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) && !/^index\./i.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      if (!includedSet.has(fullPath)) {
        const wsId = moduleResolver.toWorkspaceId(fullPath);
        if (wsId && !skippedModules.has(wsId)) {
          skippedModules.set(wsId, 'excluded by section subfolder or file filter');
        }
      }
    }
  }
}

/**
 * Crawls a section directory and its case-insensitively matched configured subfolders.
 * @param {string} sectionDir
 * @param {Array<string>} allowedSubfolders
 * @param {string} sectionType
 * @returns {Array<string>}
 */
function getFiles(sectionDir, allowedSubfolders, sectionType) {
  const results = [];
  if (!fs.existsSync(sectionDir)) return results;

  const visitedSubDirs = new Set();

  const entries = fs.readdirSync(sectionDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && isValidSourceFile(entry.name, sectionType)) {
      results.push(path.join(sectionDir, entry.name));
    }
  }

  if (Array.isArray(allowedSubfolders)) {
    for (const subfolder of allowedSubfolders) {
      const resolvedSubDir = resolveSubfolderCaseInsensitive(sectionDir, subfolder);
      if (resolvedSubDir) {
        const canonical = resolvedSubDir.toLowerCase();
        if (!visitedSubDirs.has(canonical)) {
          visitedSubDirs.add(canonical);
          collectFiles(resolvedSubDir, sectionType, results);
        }
      }
    }
  }

  return results;
}

/**
 * Builds a lowercase tag ordering map indexed by configuration tag declaration order.
 * @param {Array<object>|undefined} configTags
 * @param {Map<string, object>|undefined} tagMap
 * @returns {Map<string, number>}
 */
function buildTagOrderMap(configTags, tagMap) {
  const orderMap = new Map();
  const ordered = (Array.isArray(configTags) && configTags.length > 0)
    ? configTags
    : (tagMap ? Array.from(tagMap.values()) : []);

  ordered.forEach((tag, idx) => {
    if (tag && tag.displayName) {
      const key = tag.displayName.toLowerCase();
      if (!orderMap.has(key)) orderMap.set(key, idx);
    }
  });
  ordered.forEach((tag, idx) => {
    if (tag && tag.name) {
      const key = tag.name.toLowerCase();
      if (!orderMap.has(key)) orderMap.set(key, idx);
    }
  });
  return orderMap;
}

/**
 * Crawls configured workspace sections to build lanes, module cards, test metrics, and skip diagnostics.
 */
class WorkspaceScanner {
  /**
   * Creates a workspace section crawler and dataset builder.
   * @param {object} deps
   * @param {string} deps.workspaceRoot
   * @param {object} deps.config
   * @param {Map<string, object>} deps.tagMap
   * @param {import('./module-resolver').ModuleResolver} deps.moduleResolver
   * @param {import('./spec-resolver').SpecDependencyResolver} deps.specResolver
   * @param {object} deps.logger
   */
  constructor({ workspaceRoot, config, tagMap, moduleResolver, specResolver, logger }) {
    /** @type {string} */
    this.workspaceRoot = workspaceRoot;
    /** @type {object} */
    this.config = config;
    /** @type {Map<string, object>} */
    this.tagMap = tagMap;
    /** @type {Map<string, number>} */
    this.tagOrderMap = buildTagOrderMap(config && config.tags, tagMap);
    /** @type {import('./module-resolver').ModuleResolver} */
    this.moduleResolver = moduleResolver;
    /** @type {import('./spec-resolver').SpecDependencyResolver} */
    this.specResolver = specResolver;
    /** @type {object} */
    this.logger = logger;
    /** @type {Map<string, string>} */
    this.skippedModules = new Map();
  }

  /**
   * Scans every section defined in `config.scanConfig` and returns the raw dataset plus skipped modules.
   * @returns {{ dataset: Array<object>, skippedModules: Map<string, string> }}
   */
  scanAllSections() {
    const dataset = [];
    for (const section of this.config.scanConfig) {
      if (!section || !section.dir) continue;
      dataset.push(this.scanSection(section));
    }
    return { dataset, skippedModules: this.skippedModules };
  }

  /**
   * Scans a single configured section directory into lanes, module cards, and test metrics.
   * @param {object} section
   * @returns {object}
   */
  scanSection(section) {
    this.logger.log(`Scanning section: ${section.name} (dir: ${section.dir})`);

    const resolvedDir = path.resolve(this.workspaceRoot, section.dir);
    const files = getFiles(resolvedDir, section.subfolders, section.type);
    indexUnconfiguredSectionFiles(resolvedDir, new Set(files), this.moduleResolver, this.skippedModules);

    const laneMap = new Map();
    const metricsMap = new Map();

    for (const filePath of files) {
      const moduleId = this.moduleResolver.toWorkspaceId(filePath);
      const relativePath = path.relative(resolvedDir, filePath);
      const dirName = path.dirname(relativePath);
      const ext = path.extname(filePath);
      const cleanBaseName = path.basename(filePath, ext).replace(/\.spec$/, '');

      const parsedMeta = this.parseFileTagsAndTitle(cleanBaseName, filePath, moduleId, section);
      if (!parsedMeta) continue;

      const { fileTags, visualTitle } = parsedMeta;
      const subfolderLabel = (dirName !== '.')
        ? dirName.replace(/\\/g, '/').split('/')[0].toUpperCase()
        : null;

      let fileContent;
      try {
        fileContent = fs.readFileSync(filePath, 'utf8');
      } catch (err) {
        this.logger.warn(`Warning: Could not read file ${filePath}: ${err.message}`);
        continue;
      }

      const parsedItems = parseContent(filePath, section.type, fileContent);
      const rawImports = this.specResolver.extractFileImports(
        filePath,
        section.type === 'test',
        fileContent
      );

      if (section.type === 'test') {
        this.recordTestMetric(metricsMap, moduleId, path.basename(filePath), visualTitle, fileTags, subfolderLabel, parsedItems.length);
      }

      const moduleObj = {
        id: moduleId,
        fileName: path.basename(filePath),
        title: visualTitle,
        tags: fileTags,
        imports: rawImports,
        externalImports: [],
        items: parsedItems,
        itemType: section.type
      };

      const { groupKey, laneBadges } = this.buildModuleLaneGrouping(fileTags, subfolderLabel);
      if (!laneMap.has(groupKey)) {
        laneMap.set(groupKey, {
          laneBadges,
          modules: []
        });
      }
      laneMap.get(groupKey).modules.push(moduleObj);
    }

    const sectionIconPath = section.icon || (this.config.icons && this.config.icons.sections && this.config.icons.sections[section.name]) || '';

    return {
      title: section.name,
      folder: section.dir,
      description: section.description,
      icon: sectionIconPath,
      lanes: Array.from(laneMap.values()),
      metrics: Array.from(metricsMap.values())
    };
  }

  /**
   * Returns a new array of tag display names ordered deterministically by config tag order with lexical fallback.
   * @param {Array<string>} tags
   * @returns {Array<string>}
   */
  sortTags(tags) {
    return (tags || []).slice().sort((a, b) => {
      const idxA = this.tagOrderMap.has(a.toLowerCase()) ? this.tagOrderMap.get(a.toLowerCase()) : Number.MAX_SAFE_INTEGER;
      const idxB = this.tagOrderMap.has(b.toLowerCase()) ? this.tagOrderMap.get(b.toLowerCase()) : Number.MAX_SAFE_INTEGER;
      if (idxA !== idxB) return idxA - idxB;
      return a.localeCompare(b);
    });
  }

  /**
   * Validates tag prefixes, checks section `allowUntagged` policy, and computes canonical tag order and display title.
   * @param {string} cleanBaseName
   * @param {string} filePath
   * @param {string} moduleId
   * @param {object} section
   * @returns {{ fileTags: Array<string>, visualTitle: string }|null}
   */
  parseFileTagsAndTitle(cleanBaseName, filePath, moduleId, section) {
    const tokens = cleanBaseName.split('-');
    const firstToken = tokens[0] ? tokens[0].toLowerCase() : '';
    const isTagCandidate = /^tag[a-z0-9]{1,4}$/i.test(firstToken) && firstToken !== 'tag' && firstToken !== 'tags' && firstToken !== 'tagging';

    if (isTagCandidate && !this.tagMap.has(firstToken)) {
      this.logger.warn(`Warning: Skipping file ${filePath} with unconfigured tag prefix '${firstToken}'`);
      this.skippedModules.set(moduleId, `unconfigured tag prefix '${firstToken}'`);
      return null;
    }

    const fileTags = [];
    const seenTags = new Set();
    let tokenIndex = 0;

    while (tokenIndex < tokens.length) {
      const potentialTag = tokens[tokenIndex].toLowerCase();
      if (this.tagMap.has(potentialTag)) {
        const displayName = this.tagMap.get(potentialTag).displayName;
        if (!seenTags.has(displayName)) {
          seenTags.add(displayName);
          fileTags.push(displayName);
        }
        tokenIndex++;
      } else {
        break;
      }
    }

    const allowUntagged = section.allowUntagged ?? true;
    if (!allowUntagged && fileTags.length === 0) {
      this.logger.warn(`Warning: Skipping untagged file ${filePath}`);
      this.skippedModules.set(moduleId, `untagged file in section '${section.name}' (allowUntagged: false)`);
      return null;
    }

    const remainingName = tokens.slice(tokenIndex).join('-');
    return {
      fileTags: this.sortTags(fileTags),
      visualTitle: toTitleCase(remainingName || cleanBaseName)
    };
  }

  /**
   * Aggregates test block counts and per-file metrics keyed by canonical tag combination.
   * @param {Map<string, object>} metricsMap
   * @param {string} moduleId
   * @param {string} fileName
   * @param {string} visualTitle
   * @param {Array<string>} fileTags
   * @param {string|null} subfolderLabel
   * @param {number} itemCount
   */
  recordTestMetric(metricsMap, moduleId, fileName, visualTitle, fileTags, subfolderLabel, itemCount) {
    const categoryTags = this.sortTags(fileTags.map(t => {
      const found = this.tagMap.get(t.toLowerCase());
      return found ? found.displayName : t;
    }));
    const categoryKey = categoryTags.join('::');
    const categoryLabel = categoryTags.join(' ');

    const currentMetric = metricsMap.get(categoryKey) || {
      label: categoryLabel,
      tags: categoryTags,
      count: 0,
      files: []
    };
    currentMetric.count += itemCount;
    currentMetric.files.push({
      id: moduleId,
      fileName,
      title: visualTitle,
      subfolder: subfolderLabel || 'ROOT',
      count: itemCount
    });
    metricsMap.set(categoryKey, currentMetric);
  }

  /**
   * Computes canonical lane badge metadata and badge-only grouping key for a module card.
   * @param {Array<string>} fileTags
   * @param {string|null} subfolderLabel
   * @returns {{ groupKey: string, laneBadges: Array<{ type: string, value: string }> }}
   */
  buildModuleLaneGrouping(fileTags, subfolderLabel) {
    const orderedTags = this.sortTags(fileTags);
    const laneBadges = orderedTags.map(tag => ({ type: 'tag', value: tag }));
    if (subfolderLabel) {
      laneBadges.push({ type: 'subfolder', value: subfolderLabel });
    }
    const groupKey = laneBadges.map(b => `${b.type}:${b.value}`).join('|') || 'empty';

    return { groupKey, laneBadges };
  }
}

module.exports = {
  toTitleCase,
  isValidSourceFile,
  isDirectoryEntry,
  resolveSubfolderCaseInsensitive,
  collectFiles,
  indexUnconfiguredSectionFiles,
  getFiles,
  buildTagOrderMap,
  WorkspaceScanner
};
