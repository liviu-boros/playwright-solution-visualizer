import { SectionBlock, getSectionType } from './components/SectionBlock.js';
import { initPanZoom } from './pan-zoom.js';
import { SelectComponent } from './components/SelectComponent.js';
import { initIconManager } from './icon-manager.js';

let leftSelectComponent = null;
let rightSelectComponent = null;
let activeSourceCard = null;
let activeDependencyCards = [];
let activeReferenceCards = [];

// Fetches and parses a JSON endpoint
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

// Extracts subfolder name from a module or lane
function getSubfolder(mod, lane) {
  if (mod?.subfolder) return mod.subfolder;
  if (lane?.subfolder) return lane.subfolder;
  const subBadge = lane?.laneBadges?.find(b => b.type === 'subfolder' || b.type === 'folder');
  return subBadge?.value || 'ROOT';
}

// Normalizes directory path string
function normalizeFolder(folder) {
  if (!folder) return '';
  return folder.trim().toLowerCase().replace(/^\.\//, '').replace(/\/$/, '');
}

// Matches section to visualizer-config.json entry
function findConfigSection(section, config) {
  const scanConfig = config?.scanConfig;
  if (!Array.isArray(scanConfig)) return null;

  const sFolder = normalizeFolder(section.folder || section.dir);
  const sTitle = (section.title || section.name || '').toLowerCase();

  return scanConfig.find(item => {
    const itemDir = normalizeFolder(item.dir || item.folder);
    if (itemDir && sFolder && itemDir === sFolder) return true;
    return Boolean(item.name && sTitle && item.name.toLowerCase() === sTitle);
  }) || null;
}

// Gets normalized canonical section identifier
function getSectionFolder(section) {
  const normalized = normalizeFolder(section.folder || section.dir);
  if (normalized) return normalized;
  return (section.title || section.name || '').toLowerCase();
}

// Collects unique module identifiers from snapshot data
function collectModuleKeys(data) {
  const keys = new Set();
  if (!data) return keys;
  for (const section of data) {
    const sFolder = getSectionFolder(section);
    for (const lane of section.lanes || []) {
      for (const mod of lane.modules || []) {
        const sub = getSubfolder(mod, lane);
        keys.add(`${sFolder}|${sub}|${mod.id}`);
      }
    }
  }
  return keys;
}

// Flattens a module's items and methods into indexed records
function flattenModuleItems(mod, sFolder, laneBadges, sectionTitle, subfolder) {
  const items = [];
  const sub = subfolder || 'ROOT';
  if (mod.itemType === 'class' && Array.isArray(mod.items)) {
    for (const cls of mod.items) {
      for (const m of cls.methods || []) {
        items.push({
          sectionFolder: sFolder,
          sectionTitle,
          laneBadges,
          moduleId: mod.id,
          subfolder: sub,
          itemType: mod.itemType,
          className: cls.name,
          itemName: m.name,
          key: `${sFolder}|${sub}|${mod.id}|${cls.name}|${m.name}`
        });
      }
    }
    return items;
  }

  for (const item of mod.items || []) {
    items.push({
      sectionFolder: sFolder,
      sectionTitle,
      laneBadges,
      moduleId: mod.id,
      subfolder: sub,
      itemType: mod.itemType,
      itemName: item.name,
      key: `${sFolder}|${sub}|${mod.id}|${item.name}`
    });
  }
  return items;
}

// Collects all individual items across sections
function collectDataItems(data) {
  const items = [];
  if (!data) return items;
  for (const section of data) {
    const sFolder = getSectionFolder(section);
    for (const lane of section.lanes || []) {
      for (const mod of lane.modules || []) {
        const sub = getSubfolder(mod, lane);
        items.push(...flattenModuleItems(mod, sFolder, lane.laneBadges, section.title, sub));
      }
    }
  }
  return items;
}

// Marks newly added items in target dataset
function markNewTargetItems(targetData, baselineItemSet) {
  const targetItemSet = new Set();
  for (const section of targetData) {
    const sFolder = getSectionFolder(section);
    for (const lane of section.lanes || []) {
      for (const mod of lane.modules || []) {
        const sub = getSubfolder(mod, lane);
        if (mod.itemType === 'class' && Array.isArray(mod.items)) {
          for (const cls of mod.items) {
            for (const m of cls.methods || []) {
              const key = `${sFolder}|${sub}|${mod.id}|${cls.name}|${m.name}`;
              targetItemSet.add(key);
              if (!baselineItemSet.has(key)) m.status = 'new';
            }
          }
        } else if (Array.isArray(mod.items)) {
          for (const item of mod.items) {
            const key = `${sFolder}|${sub}|${mod.id}|${item.name}`;
            targetItemSet.add(key);
            if (!baselineItemSet.has(key)) item.status = 'new';
          }
        }
      }
    }
  }
  return targetItemSet;
}

// Creates a deep copy of a removed module with removed status on all child elements
function createRemovedModuleCopy(mod) {
  const copy = JSON.parse(JSON.stringify(mod));
  copy.status = 'removed';
  if (copy.itemType === 'class' && Array.isArray(copy.items)) {
    for (const cls of copy.items) {
      for (const m of cls.methods || []) m.status = 'removed';
    }
  } else if (Array.isArray(copy.items)) {
    for (const item of copy.items) item.status = 'removed';
  }
  return copy;
}

// Ensures target section exists in dataset
function ensureTargetSection(targetData, section, sFolder, config) {
  let sectionTarget = targetData.find(s => getSectionFolder(s) === sFolder);
  if (!sectionTarget) {
    const cfg = findConfigSection(section, config);
    sectionTarget = {
      title: cfg?.name || section.title,
      folder: cfg?.dir || section.folder,
      description: cfg?.description !== undefined ? cfg.description : section.description,
      icon: cfg?.icon || section.icon,
      lanes: [],
      metrics: []
    };
    targetData.push(sectionTarget);
  }
  return sectionTarget;
}

// Ensures target lane exists within section
function ensureTargetLane(sectionTarget, laneBadges) {
  const laneKey = JSON.stringify(laneBadges);
  let laneTarget = sectionTarget.lanes.find(l => JSON.stringify(l.laneBadges) === laneKey);
  if (!laneTarget) {
    laneTarget = { laneBadges, modules: [] };
    sectionTarget.lanes.push(laneTarget);
  }
  return laneTarget;
}

// Injects removed modules from baseline into target
function injectRemovedBaselineModules(targetData, baselineData, targetModuleKeys, config) {
  for (const section of baselineData) {
    const sFolder = getSectionFolder(section);
    for (const lane of section.lanes || []) {
      for (const bMod of lane.modules || []) {
        const sub = getSubfolder(bMod, lane);
        const modKey = `${sFolder}|${sub}|${bMod.id}`;
        if (targetModuleKeys.has(modKey)) continue;

        const sectionTarget = ensureTargetSection(targetData, section, sFolder, config);
        const laneTarget = ensureTargetLane(sectionTarget, lane.laneBadges);

        if (!laneTarget.modules.some(m => m.id === bMod.id)) {
          laneTarget.modules.push(createRemovedModuleCopy(bMod));
          targetModuleKeys.add(modKey);
        }
      }
    }
  }
}

// Injects removed items from baseline into existing target modules
function injectRemovedBaselineItems(targetData, baselineItems, targetItemSet) {
  for (const bItem of baselineItems) {
    if (targetItemSet.has(bItem.key)) continue;

    const section = targetData.find(s => getSectionFolder(s) === bItem.sectionFolder);
    if (!section) continue;

    const laneKey = JSON.stringify(bItem.laneBadges);
    const lane = section.lanes.find(l => JSON.stringify(l.laneBadges) === laneKey);
    if (!lane) continue;

    const mod = lane.modules.find(m => m.id === bItem.moduleId && getSubfolder(m, lane) === bItem.subfolder);
    if (!mod) continue;

    if (bItem.itemType === 'class') {
      let cls = mod.items.find(c => c.name === bItem.className);
      if (!cls) {
        cls = { name: bItem.className, methods: [] };
        mod.items.push(cls);
      }
      if (!cls.methods.some(m => m.name === bItem.itemName)) {
        cls.methods.push({ name: bItem.itemName, status: 'removed' });
      }
    } else if (!mod.items.some(i => i.name === bItem.itemName)) {
      mod.items.push({ name: bItem.itemName, status: 'removed' });
    }
  }
}

// Computes summary metrics for class or function sections
function computeStandardMetrics(section) {
  section.totalLabel = `Total ${section.title}`;
  section.metrics = [];
  let totalCount = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const lane of section.lanes || []) {
    const tagBadges = (lane.laneBadges || []).filter(b => b.type === 'tag');

    if (tagBadges.length === 0) {
      for (const mod of lane.modules || []) {
        if (mod.status !== 'removed') totalCount++;
        if (mod.status === 'new') totalAdded++;
        if (mod.status === 'removed') totalRemoved++;
      }
      continue;
    }

    const catLabel = tagBadges.map(b => b.value).join(' ');
    let metric = section.metrics.find(m => m.label === catLabel);
    if (!metric) {
      metric = { label: catLabel, tags: tagBadges.map(b => b.value), count: 0, added: 0, removed: 0 };
      section.metrics.push(metric);
    }

    for (const mod of lane.modules || []) {
      if (mod.status !== 'removed') {
        metric.count++;
        totalCount++;
      }
      if (mod.status === 'new') {
        metric.added++;
        totalAdded++;
      }
      if (mod.status === 'removed') {
        metric.removed++;
        totalRemoved++;
      }
    }
  }

  section.totalCount = totalCount;
  section.totalAdded = totalAdded;
  section.totalRemoved = totalRemoved;
}

// Computes diff item totals for a test module
function countModuleItemDiffs(mod) {
  let active = 0, added = 0, removed = 0;
  if (!mod || !Array.isArray(mod.items)) return { active, added, removed };

  for (const item of mod.items) {
    if (item.methods && Array.isArray(item.methods)) {
      for (const m of item.methods) {
        if (m.status !== 'removed') active++;
        if (m.status === 'new') added++;
        if (m.status === 'removed') removed++;
      }
    } else {
      if (item.status !== 'removed') active++;
      if (item.status === 'new') added++;
      if (item.status === 'removed') removed++;
    }
  }
  return { active, added, removed };
}

// Computes summary metrics for test sections with subfolder groupings
function computeTestMetrics(section) {
  section.totalLabel = `Total ${section.title}`;
  if (!Array.isArray(section.metrics)) section.metrics = [];

  const moduleMap = new Map();
  for (const lane of section.lanes || []) {
    for (const mod of lane.modules || []) {
      const sub = getSubfolder(mod, lane);
      if (mod.id) moduleMap.set(`${sub}|${mod.id}`, mod);
      if (mod.fileName) moduleMap.set(`${sub}|${mod.fileName}`, mod);
    }
  }

  let totalCount = 0;
  let totalAdded = 0;
  let totalRemoved = 0;

  for (const metric of section.metrics) {
    if (!Array.isArray(metric.files)) metric.files = [];

    const metricTags = (metric.tags && metric.tags.length > 0) ? metric.tags : [metric.label];
    const metricTagKey = metricTags.slice().sort().map(t => t.toLowerCase()).join('::');

    for (const lane of section.lanes || []) {
      const laneTags = (lane.laneBadges || [])
        .filter(b => b.type === 'tag')
        .map(b => b.value.toLowerCase())
        .sort()
        .join('::');

      if (laneTags !== metricTagKey) continue;

      for (const mod of lane.modules || []) {
        const sub = getSubfolder(mod, lane);
        let f = metric.files.find(file =>
          (file.subfolder || getSubfolder(file, lane)) === sub &&
          (file.id === mod.id || file.fileName === mod.fileName)
        );
        if (!f) {
          f = {
            id: mod.id,
            fileName: mod.fileName || mod.id,
            title: mod.title || mod.fileName || mod.id,
            subfolder: sub,
            count: 0,
            added: 0,
            removed: 0
          };
          metric.files.push(f);
        } else {
          f.subfolder = sub;
        }
      }
    }

    let catCount = 0, catAdded = 0, catRemoved = 0;
    for (const f of metric.files) {
      const subKey = f.subfolder || 'ROOT';
      const mod = moduleMap.get(`${subKey}|${f.id}`) || moduleMap.get(`${subKey}|${f.fileName}`);
      if (mod) {
        if (mod.subfolder) f.subfolder = mod.subfolder;
        if (mod.title) f.title = mod.title;
      }

      const diffs = countModuleItemDiffs(mod);
      f.count = diffs.active;
      f.added = diffs.added;
      f.removed = diffs.removed;

      catCount += diffs.active;
      catAdded += diffs.added;
      catRemoved += diffs.removed;
    }

    metric.count = catCount;
    metric.added = catAdded;
    metric.removed = catRemoved;

    totalCount += catCount;
    totalAdded += catAdded;
    totalRemoved += catRemoved;
  }

  section.totalCount = totalCount;
  section.totalAdded = totalAdded;
  section.totalRemoved = totalRemoved;
}

// Compares target snapshot against baseline snapshot and flags diff states
function diffSnapshots(currentData, baselineData, config) {
  const targetData = JSON.parse(JSON.stringify(currentData));
  const baselineModuleKeys = collectModuleKeys(baselineData);

  // Mark newly added modules in target
  const targetModuleKeys = new Set();
  for (const section of targetData) {
    const sFolder = getSectionFolder(section);
    for (const lane of section.lanes || []) {
      for (const mod of lane.modules || []) {
        const sub = getSubfolder(mod, lane);
        const modKey = `${sFolder}|${sub}|${mod.id}`;
        targetModuleKeys.add(modKey);
        if (baselineData && !baselineModuleKeys.has(modKey)) {
          mod.status = 'new';
        }
      }
    }
  }

  if (baselineData) {
    const baselineItems = collectDataItems(baselineData);
    const baselineItemSet = new Set(baselineItems.map(i => i.key));
    const targetItemSet = markNewTargetItems(targetData, baselineItemSet);

    injectRemovedBaselineModules(targetData, baselineData, targetModuleKeys, config);
    injectRemovedBaselineItems(targetData, baselineItems, targetItemSet);
  }

  // Bind titles and compute section metrics
  for (const section of targetData) {
    const cfg = findConfigSection(section, config);
    if (cfg) {
      section.title = cfg.name || section.title;
      section.description = cfg.description !== undefined ? cfg.description : section.description;
      section.icon = cfg.icon || section.icon;
      section.folder = cfg.dir || section.folder;
    }

    const secType = getSectionType(section, config);
    if (secType === 'test') {
      computeTestMetrics(section);
    } else {
      computeStandardMetrics(section);
    }
  }

  return targetData;
}

// Computes absolute position coordinates relative to canvas
function getCanvasCoords(el, canvasEl) {
  let left = 0;
  let top = 0;
  let current = el;
  while (current && current !== canvasEl) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent;
  }
  return {
    left,
    top,
    width: el.offsetWidth,
    height: el.offsetHeight,
    right: left + el.offsetWidth,
    bottom: top + el.offsetHeight
  };
}

// Clears all active card highlights and connection curves
function clearDependencyHighlighting() {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  const highlightedElements = canvas.querySelectorAll('.is-dimmed, .is-active-source, .is-active-dependency, .is-active-reference, .is-active-source--removed, .has-port-left, .has-port-right');
  highlightedElements.forEach(el => {
    el.classList.remove('is-active-source', 'is-active-dependency', 'is-active-reference', 'is-dimmed', 'is-active-source--removed', 'has-port-left', 'has-port-right');
  });

  const connectionsLayer = document.getElementById('connectionsLayer');
  if (connectionsLayer) {
    connectionsLayer.innerHTML = '';
  }

  activeSourceCard = null;
  activeDependencyCards = [];
  activeReferenceCards = [];
}

// Computes cubic Bezier SVG path element for card relationships
function createBezierPath(sourceCoords, sourceCenter, targetCoords, isDependency) {
  const targetCenter = {
    x: targetCoords.left + targetCoords.width / 2,
    y: targetCoords.top + targetCoords.height / 2
  };

  const deltaX = targetCenter.x - sourceCenter.x;
  const deltaY = targetCenter.y - sourceCenter.y;

  // Dependencies exit left; references exit right
  const x1 = isDependency ? sourceCoords.left : sourceCoords.right;
  const y1 = sourceCenter.y;
  const cDistX = Math.max(Math.abs(deltaX) * 0.3, 30);
  const cDistY = Math.max(Math.abs(deltaY) * 0.3, 30);

  const cp1 = { x: isDependency ? x1 - cDistX : x1 + cDistX, y: y1 };

  let x2, y2, cp2;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    x2 = isDependency ? targetCoords.right : targetCoords.left;
    y2 = targetCenter.y;
    cp2 = { x: isDependency ? x2 + cDistX : x2 - cDistX, y: y2 };
  } else {
    // x2 = targetCenter.x;
    // y2 = deltaY > 0 ? targetCoords.top : targetCoords.bottom;
    // cp2 = { x: x2, y: deltaY > 0 ? y2 - cDistY : y2 + cDistY };
    x2 = isDependency ? targetCoords.right : targetCoords.left;
    y2 = targetCenter.y;
    cp2 = { x: isDependency ? x2 + cDistX : x2 - cDistX, y: y2 };
  }

  const d = `M ${x1} ${y1} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${x2} ${y2}`;
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', d);
  pathEl.setAttribute('class', `connection-path ${isDependency ? 'dependency-path' : 'reference-path'}`);
  return pathEl;
}

// Draws SVG cubic Bezier dependency and reference curves
function drawConnections(sourceCard, dependencyCards = [], referenceCards = []) {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  let connectionsLayer = document.getElementById('connectionsLayer');
  if (!connectionsLayer) {
    connectionsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connectionsLayer.id = 'connectionsLayer';
    connectionsLayer.classList.add('connections-layer');
    canvas.prepend(connectionsLayer);
  }

  connectionsLayer.innerHTML = '';

  const sourceCoords = getCanvasCoords(sourceCard, canvas);
  const sourceCenter = {
    x: sourceCoords.left + sourceCoords.width / 2,
    y: sourceCoords.top + sourceCoords.height / 2
  };

  for (const card of dependencyCards) {
    const targetCoords = getCanvasCoords(card, canvas);
    connectionsLayer.appendChild(createBezierPath(sourceCoords, sourceCenter, targetCoords, true));
  }

  for (const card of referenceCards) {
    const refCoords = getCanvasCoords(card, canvas);
    connectionsLayer.appendChild(createBezierPath(sourceCoords, sourceCenter, refCoords, false));
  }
}

// Parses imports array from card data attribute safely
function parseCardImports(card) {
  try {
    return JSON.parse(card.dataset.imports || '[]');
  } catch {
    return [];
  }
}

// Helper matcher for module IDs and path aliases
function isModuleMatch(importId, targetModId, targetCleanId) {
  if (!importId) return false;
  if (importId === targetModId || importId === targetCleanId) return true;
  if (importId.replace(/\.spec$/, '') === targetCleanId) return true;
  if (importId.endsWith(`/${targetModId}`) || importId.endsWith(`/${targetCleanId}`)) return true;
  const baseName = targetModId.split('/').pop();
  return importId.endsWith(`/${baseName}`) || importId === baseName;
}

// Activates single card selection, highlights relations, and dims unrelated cards
function setDependencyHighlighting(sourceCard) {
  clearDependencyHighlighting();

  const canvas = document.getElementById('canvas');
  if (!canvas || !sourceCard) return;

  activeSourceCard = sourceCard;
  const isRemoved = sourceCard.classList.contains('module-card--removed');
  sourceCard.classList.add(isRemoved ? 'is-active-source--removed' : 'is-active-source');

  const sourceImports = parseCardImports(sourceCard);
  const sourceModuleId = sourceCard.dataset.moduleId || '';
  const sourceCleanId = sourceModuleId.replace(/\.spec$/, '');

  const allCards = Array.from(canvas.querySelectorAll('.module-card'));
  const dependencyCards = [];
  const referenceCards = [];

  for (const card of allCards) {
    if (card === sourceCard) continue;

    const cardModuleId = card.dataset.moduleId || '';
    const cardCleanId = cardModuleId.replace(/\.spec$/, '');
    const cardImports = parseCardImports(card);

    const isDep = sourceImports.some(id => isModuleMatch(id, cardModuleId, cardCleanId));
    const isRef = cardImports.some(id => isModuleMatch(id, sourceModuleId, sourceCleanId));

    if (isDep) {
      card.classList.add('is-active-dependency');
      dependencyCards.push(card);
    }
    if (isRef) {
      card.classList.add('is-active-reference');
      referenceCards.push(card);
    }
  }

  activeDependencyCards = dependencyCards;
  activeReferenceCards = referenceCards;

  // Manage connection port visibility on target dependency and reference cards
  for (const card of dependencyCards) {
    card.classList.add('has-port-right');
  }

  for (const card of referenceCards) {
    card.classList.add('has-port-left');
  }

  // Dim unrelated elements
  const activeSet = new Set([sourceCard, ...dependencyCards, ...referenceCards]);
  for (const card of allCards) {
    if (!activeSet.has(card)) card.classList.add('is-dimmed');
  }

  canvas.querySelectorAll('.section-anchor, .lane-identifiers').forEach(el => el.classList.add('is-dimmed'));

  if (dependencyCards.length > 0 || referenceCards.length > 0) {
    drawConnections(sourceCard, dependencyCards, referenceCards);
  }
}

// Injects section blocks into the DOM canvas
function renderCanvas(data, config) {
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = '';

  const connectionsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connectionsLayer.id = 'connectionsLayer';
  connectionsLayer.classList.add('connections-layer');
  canvas.appendChild(connectionsLayer);

  for (const section of data) {
    const hasModules = section.lanes.some(lane => lane.modules.length > 0);
    if (!hasModules) continue;
    canvas.insertAdjacentHTML('beforeend', SectionBlock(section, config));
  }

  if (canvas.children.length <= 1) {
    canvas.innerHTML = `
      <div style="padding: 100px; text-align: center; color: var(--color-text-muted);">
        <h1>No scanned modules found</h1>
        <p>Ensure mock folders are populated and sync-visualizer.js has run.</p>
      </div>
    `;
  }
}

// Formats ledger snapshot timestamp into a display label
function formatSnapshotLabel(run) {
  const labelPrefix = run.label || 'snapshot';
  let timestampStr = run.timestamp;

  if (!timestampStr && run.file) {
    const match = run.file.match(/(\d{2}-\d{2}-\d{2}-\d{6})/);
    if (match) timestampStr = match[1];
  }

  return timestampStr ? `${labelPrefix}-${timestampStr}` : labelPrefix;
}

// Handles canvas click selection and background deselection
function handleCanvasClick(e, mouseDownPos) {
  const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
  if (dist > 5) return;
  if (e.target.closest('.control-panel')) return;

  const card = e.target.closest('.module-card');
  if (!card) {
    if (activeSourceCard) clearDependencyHighlighting();
    return;
  }

  if (activeSourceCard === card) {
    clearDependencyHighlighting();
    return;
  }

  setDependencyHighlighting(card);
}

// Application startup entry point
async function init() {
  try {
    const config = await fetchJSON('visualizer-config.json');
    await initIconManager(config);
    const ledger = await fetchJSON('data/index.json');

    if (!ledger || ledger.length === 0) {
      document.getElementById('canvas').innerHTML = `
        <div style="padding: 100px; text-align: center; color: var(--color-text-muted);">
          <h1>No snapshots found</h1>
          <p>Please run the scraper script using <code>node visualizer/sync-visualizer.js</code> first.</p>
        </div>
      `;
      return;
    }

    const selectItems = ledger.map((run, idx) => ({
      value: idx,
      label: formatSnapshotLabel(run)
    }));

    let leftIndex = 0;
    let rightIndex = ledger.length > 1 ? 1 : 0;

    const loadDiffView = async (targetIdx, baselineIdx) => {
      clearDependencyHighlighting();
      const targetRun = ledger[targetIdx];
      const baselineRun = ledger[baselineIdx];

      const targetData = await fetchJSON(`data/${targetRun.file}`);
      let baselineData = null;
      if (baselineIdx !== targetIdx && baselineRun) {
        try {
          baselineData = await fetchJSON(`data/${baselineRun.file}`);
        } catch (e) {
          console.warn(`Could not load baseline snapshot ${baselineRun.file}: ${e.message}`);
        }
      }

      const diffedData = diffSnapshots(targetData, baselineData, config);
      renderCanvas(diffedData, config);
    };

    leftSelectComponent = new SelectComponent({
      id: 'leftTimelineSelect',
      ariaLabel: 'Select target snapshot',
      items: selectItems,
      selectedValue: leftIndex,
      disabledValue: rightIndex,
      disabledBadgeText: 'active baseline',
      onChange: async (newLeftVal) => {
        leftIndex = newLeftVal;
        rightSelectComponent.setDisabledValue(leftIndex);
        await loadDiffView(leftIndex, rightIndex);
      }
    });
    const leftContainer = document.getElementById('leftSelectContainer');
    leftContainer.innerHTML = '';
    leftContainer.appendChild(leftSelectComponent.getElement());

    rightSelectComponent = new SelectComponent({
      id: 'rightTimelineSelect',
      ariaLabel: 'Select baseline snapshot',
      items: selectItems,
      selectedValue: rightIndex,
      disabledValue: leftIndex,
      disabledBadgeText: 'active target',
      onChange: async (newRightVal) => {
        rightIndex = newRightVal;
        leftSelectComponent.setDisabledValue(rightIndex);
        await loadDiffView(leftIndex, rightIndex);
      }
    });
    const rightContainer = document.getElementById('rightSelectContainer');
    rightContainer.innerHTML = '';
    rightContainer.appendChild(rightSelectComponent.getElement());

    await loadDiffView(leftIndex, rightIndex);
    initPanZoom('viewport', 'canvas');

    const viewport = document.getElementById('viewport');
    let mouseDownPos = { x: 0, y: 0 };

    viewport.addEventListener('mousedown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    viewport.addEventListener('click', (e) => {
      handleCanvasClick(e, mouseDownPos);
    });

    window.addEventListener('resize', () => {
      if (activeSourceCard) {
        drawConnections(activeSourceCard, activeDependencyCards, activeReferenceCards);
      }
    });

  } catch (error) {
    console.error('Initialization error:', error);
    document.getElementById('canvas').innerHTML = `
      <div style="padding: 100px; text-align: center; color: #ff5555;">
        <h1>Initialization Error</h1>
        <p>${error.message}</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', init);
