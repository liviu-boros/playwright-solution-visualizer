'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Generates a `dd-mm-yy-hhmmss` timestamp string for snapshot filenames and ledger entries.
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
 * Atomically writes serialized JSON data to `targetPath` via a temporary sibling file.
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
 * Filters raw module dependencies against existing dataset card IDs and partitions non-card targets into `externalImports`.
 * @param {Array<object>} dataset
 * @param {Map<string, string>} skippedModules
 * @param {object} [logger=console]
 */
function filterDatasetImports(dataset, skippedModules, logger = console) {
  const datasetModuleIds = new Set();
  for (const section of dataset) {
    for (const lane of section.lanes || []) {
      for (const mod of lane.modules || []) {
        if (mod.id) datasetModuleIds.add(mod.id);
      }
    }
  }

  for (const section of dataset) {
    for (const lane of section.lanes || []) {
      for (const mod of lane.modules || []) {
        const validImports = [];
        const externalImports = [];
        const seenValid = new Set();
        const seenExt = new Set();

        for (const depId of mod.imports || []) {
          if (!depId || depId === mod.id) continue;
          if (datasetModuleIds.has(depId)) {
            if (!seenValid.has(depId)) {
              seenValid.add(depId);
              validImports.push(depId);
            }
          } else if (!seenExt.has(depId)) {
            seenExt.add(depId);
            externalImports.push(depId);
            if (skippedModules.has(depId)) {
              logger.warn(`Warning: Module '${mod.id}' imports skipped module '${depId}' (${skippedModules.get(depId)})`);
            }
          }
        }

        mod.imports = validImports;
        mod.externalImports = externalImports;
      }
    }
  }
}

/**
 * Writes the dataset snapshot JSON and prepends its entry to `index.json` when `writeFiles` is enabled.
 * @param {string} dataDir
 * @param {Array<object>} dataset
 * @param {boolean} writeFiles
 * @param {object} [logger=console]
 * @returns {{ snapshotPath: string, indexPath: string, snapshotFilename: string, timestampStr: string }}
 */
function persistSnapshot(dataDir, dataset, writeFiles, logger = console) {
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
    snapshotPath,
    indexPath,
    snapshotFilename,
    timestampStr
  };
}

module.exports = {
  formatTimestamp,
  writeJsonAtomic,
  filterDatasetImports,
  persistSnapshot
};
