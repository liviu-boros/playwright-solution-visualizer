'use strict';

const path = require('path');
const { loadConfig, loadTsConfig, buildTagMap, ModuleResolver } = require('./miner/module-resolver');
const { FixtureAnalyzer } = require('./miner/fixture-analyzer');
const { SpecDependencyResolver } = require('./miner/spec-resolver');
const { WorkspaceScanner } = require('./miner/workspace-scanner');
const { filterDatasetImports, persistSnapshot } = require('./miner/snapshot-writer');

/**
 * Orchestrates codebase architecture mining into an atomic visualizer JSON snapshot and ledger index.
 * @param {object} [options={}]
 * @returns {{ dataset: Array<object>, snapshotPath: string, indexPath: string, snapshotFilename: string, timestampStr: string }}
 */
function runMiner(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.env.VISUALIZER_WORKSPACE_ROOT || path.resolve(__dirname, '..'));
  const configPath = options.configPath || process.env.VISUALIZER_CONFIG_PATH || path.join(__dirname, 'visualizer-config.json');
  const dataDir = options.dataDir || process.env.VISUALIZER_DATA_DIR || path.join(__dirname, 'data');
  const silent = Boolean(options.silent || process.env.VISUALIZER_SILENT === 'true');
  const writeFiles = options.writeFiles !== undefined ? options.writeFiles : (process.env.VISUALIZER_WRITE_FILES !== 'false');
  const logger = options.logger || (silent ? { log: () => {}, warn: () => {}, error: () => {} } : console);

  const config = loadConfig(configPath, logger);
  const tagMap = buildTagMap(config.tags);
  const tsConfigInfo = loadTsConfig(workspaceRoot, logger);
  const moduleResolver = new ModuleResolver(workspaceRoot, tsConfigInfo);

  const testsSection = config.scanConfig.find(s => s && s.type === 'test');
  const configuredFixturesDir = (testsSection && testsSection.fixturesDir) || './tests/fixtures';
  const absFixturesDir = path.resolve(workspaceRoot, configuredFixturesDir);

  logger.log(`[AST Scanner] Parsing fixtures in ${absFixturesDir}...`);
  const fixtureLookup = new FixtureAnalyzer(moduleResolver).buildLookup(absFixturesDir);
  logger.log(`[AST Scanner] Generated ${fixtureLookup.combinedMap.size} fixture mappings.`);

  const specResolver = new SpecDependencyResolver(moduleResolver, fixtureLookup);
  const scanner = new WorkspaceScanner({
    workspaceRoot,
    config,
    tagMap,
    moduleResolver,
    specResolver,
    logger
  });
  const { dataset, skippedModules } = scanner.scanAllSections();

  filterDatasetImports(dataset, skippedModules, logger);
  const writeSummary = persistSnapshot(dataDir, dataset, writeFiles, logger);

  return {
    dataset,
    ...writeSummary
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
