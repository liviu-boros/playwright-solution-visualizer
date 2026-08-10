// js/app.js
import { SectionBlock, getSectionType } from './SectionBlock.js';
import { initPanZoom } from './pan-zoom.js';
import { SelectComponent } from './SelectComponent.js';

let leftSelectComponent = null;
let rightSelectComponent = null;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.json();
}

// High-speed browser diffing engine: compares current target against baseline snapshot
function diffSnapshots(currentData, baselineData, config) {
  const targetData = JSON.parse(JSON.stringify(currentData));

  // Module key sets for module-level status
  const baselineModuleKeys = new Set();
  if (baselineData) {
    baselineData.forEach(section => {
      section.lanes.forEach(lane => {
        lane.modules.forEach(mod => {
          baselineModuleKeys.add(`${section.title}|${mod.id}`);
        });
      });
    });
  }

  const targetModuleKeys = new Set();
  targetData.forEach(section => {
    section.lanes.forEach(lane => {
      lane.modules.forEach(mod => {
        const modKey = `${section.title}|${mod.id}`;
        targetModuleKeys.add(modKey);
        if (baselineData && !baselineModuleKeys.has(modKey)) {
          mod.status = 'new';
        }
      });
    });
  });

  if (baselineData) {
    // Flatten baseline items & methods
    const baselineItemSet = new Set();
    const baselineItems = [];

    baselineData.forEach(section => {
      section.lanes.forEach(lane => {
        lane.modules.forEach(mod => {
          if (mod.itemType === 'class' && Array.isArray(mod.items)) {
            mod.items.forEach(cls => {
              if (cls.methods && Array.isArray(cls.methods)) {
                cls.methods.forEach(m => {
                  const key = `${section.title}|${mod.id}|${cls.name}|${m.name}`;
                  baselineItemSet.add(key);
                  baselineItems.push({
                    sectionTitle: section.title,
                    laneBadges: lane.laneBadges,
                    moduleId: mod.id,
                    itemType: mod.itemType,
                    className: cls.name,
                    itemName: m.name,
                    key: key
                  });
                });
              }
            });
          } else if (Array.isArray(mod.items)) {
            mod.items.forEach(item => {
              const key = `${section.title}|${mod.id}|${item.name}`;
              baselineItemSet.add(key);
              baselineItems.push({
                sectionTitle: section.title,
                laneBadges: lane.laneBadges,
                moduleId: mod.id,
                itemType: mod.itemType,
                itemName: item.name,
                key: key
              });
            });
          }
        });
      });
    });

    // Mark newly added items in target
    const targetItemSet = new Set();
    targetData.forEach(section => {
      section.lanes.forEach(lane => {
        lane.modules.forEach(mod => {
          if (mod.itemType === 'class' && Array.isArray(mod.items)) {
            mod.items.forEach(cls => {
              if (cls.methods && Array.isArray(cls.methods)) {
                cls.methods.forEach(m => {
                  const key = `${section.title}|${mod.id}|${cls.name}|${m.name}`;
                  targetItemSet.add(key);
                  if (!baselineItemSet.has(key)) {
                    m.status = 'new';
                  }
                });
              }
            });
          } else if (Array.isArray(mod.items)) {
            mod.items.forEach(item => {
              const key = `${section.title}|${mod.id}|${item.name}`;
              targetItemSet.add(key);
              if (!baselineItemSet.has(key)) {
                item.status = 'new';
              }
            });
          }
        });
      });
    });

    // Add completely removed modules from baseline to targetData
    baselineData.forEach(section => {
      section.lanes.forEach(lane => {
        lane.modules.forEach(bMod => {
          const modKey = `${section.title}|${bMod.id}`;
          if (!targetModuleKeys.has(modKey)) {
            let sectionTarget = targetData.find(s => s.title === section.title);
            if (!sectionTarget) {
              sectionTarget = {
                title: section.title,
                folder: section.folder,
                description: section.description,
                icon: section.icon,
                lanes: [],
                metrics: []
              };
              targetData.push(sectionTarget);
            }
            const laneKey = JSON.stringify(lane.laneBadges);
            let laneTarget = sectionTarget.lanes.find(l => JSON.stringify(l.laneBadges) === laneKey);
            if (!laneTarget) {
              laneTarget = {
                laneBadges: lane.laneBadges,
                modules: []
              };
              sectionTarget.lanes.push(laneTarget);
            }
            let modTarget = laneTarget.modules.find(m => m.id === bMod.id);
            if (!modTarget) {
              const modCopy = JSON.parse(JSON.stringify(bMod));
              modCopy.status = 'removed';
              if (modCopy.itemType === 'class' && Array.isArray(modCopy.items)) {
                modCopy.items.forEach(c => {
                  if (c.methods) c.methods.forEach(m => m.status = 'removed');
                });
              } else if (Array.isArray(modCopy.items)) {
                modCopy.items.forEach(i => i.status = 'removed');
              }
              laneTarget.modules.push(modCopy);
              targetModuleKeys.add(modKey);
            }
          }
        });
      });
    });

    // Process removed items from baseline for modules present in target
    baselineItems.forEach(bItem => {
      if (!targetItemSet.has(bItem.key)) {
        let section = targetData.find(s => s.title === bItem.sectionTitle);
        if (section) {
          const laneKey = JSON.stringify(bItem.laneBadges);
          let lane = section.lanes.find(l => JSON.stringify(l.laneBadges) === laneKey);
          if (lane) {
            let mod = lane.modules.find(m => m.id === bItem.moduleId);
            if (mod) {
              if (bItem.itemType === 'class') {
                let cls = mod.items.find(c => c.name === bItem.className);
                if (!cls) {
                  cls = { name: bItem.className, methods: [] };
                  mod.items.push(cls);
                }
                if (!cls.methods.some(m => m.name === bItem.itemName)) {
                  cls.methods.push({
                    name: bItem.itemName,
                    status: 'removed'
                  });
                }
              } else {
                if (!mod.items.some(i => i.name === bItem.itemName)) {
                  mod.items.push({
                    name: bItem.itemName,
                    status: 'removed'
                  });
                }
              }
            }
          }
        }
      }
    });
  }

  // Compute metrics and total labels per section
  targetData.forEach(section => {
    const secType = getSectionType(section.title, config);

    if (secType !== 'test') {
      section.totalLabel = `Total ${section.title}`;
      section.metrics = [];

      let secTotalCount = 0;
      let secTotalAdded = 0;
      let secTotalRemoved = 0;

      section.lanes.forEach(lane => {
        const tagBadges = (lane.laneBadges || []).filter(b => b.type === 'tag');
        if (tagBadges.length === 0) {
          lane.modules.forEach(mod => {
            if (mod.status !== 'removed') {
              secTotalCount += 1;
            }
            if (mod.status === 'new') {
              secTotalAdded += 1;
            }
            if (mod.status === 'removed') {
              secTotalRemoved += 1;
            }
          });
          return;
        }

        const catLabel = tagBadges.map(b => b.value).join(' ');
        const catTags = tagBadges.map(b => b.value);

        let metric = section.metrics.find(m => m.label === catLabel);
        if (!metric) {
          metric = {
            label: catLabel,
            tags: catTags,
            count: 0,
            added: 0,
            removed: 0
          };
          section.metrics.push(metric);
        }

        lane.modules.forEach(mod => {
          if (mod.status !== 'removed') {
            metric.count += 1;
            secTotalCount += 1;
          }
          if (mod.status === 'new') {
            metric.added += 1;
            secTotalAdded += 1;
          }
          if (mod.status === 'removed') {
            metric.removed += 1;
            secTotalRemoved += 1;
          }
        });
      });

      section.totalCount = secTotalCount;
      section.totalAdded = secTotalAdded;
      section.totalRemoved = secTotalRemoved;

    } else {
      section.totalLabel = 'Total Tests';

      if (!section.metrics || !Array.isArray(section.metrics)) {
        section.metrics = [];
      }

      // Construct module lookup Map for section modules
      const moduleMap = new Map();
      section.lanes.forEach(lane => {
        lane.modules.forEach(mod => {
          if (mod.id) moduleMap.set(mod.id, mod);
          if (mod.fileName) moduleMap.set(mod.fileName, mod);
        });
      });

      let secTotalCount = 0;
      let secTotalAdded = 0;
      let secTotalRemoved = 0;

      section.metrics.forEach(metric => {
        if (!metric.files || !Array.isArray(metric.files)) {
          metric.files = [];
        }

        const metricTags = (metric.tags && metric.tags.length > 0)
          ? metric.tags
          : [metric.label];
        const metricTagKey = metricTags.slice().sort().map(t => t.toLowerCase()).join('::');

        // Module Aggregation & Dynamic File Matching
        // Iterate over all modules present across section.lanes (including active & removed)
        section.lanes.forEach(lane => {
          const laneTags = (lane.laneBadges || [])
            .filter(b => b.type === 'tag')
            .map(b => b.value.toLowerCase())
            .sort()
            .join('::');

          if (laneTags === metricTagKey) {
            lane.modules.forEach(mod => {
              let f = metric.files.find(file => file.id === mod.id || file.fileName === mod.fileName);
              if (!f) {
                f = {
                  id: mod.id,
                  fileName: mod.fileName || mod.id,
                  title: mod.title || mod.fileName || mod.id,
                  subfolder: mod.subfolder || 'ROOT',
                  count: 0,
                  added: 0,
                  removed: 0
                };
                metric.files.push(f);
              }
            });
          }
        });

        // Accurate Item Diff Counting Per File (O(1) Map lookup)
        let catCount = 0;
        let catAdded = 0;
        let catRemoved = 0;

        metric.files.forEach(f => {
          let fActive = 0;
          let fAdded = 0;
          let fRemoved = 0;

          const mod = moduleMap.get(f.id) || moduleMap.get(f.fileName);
          if (mod) {
            if (mod.subfolder) {
              f.subfolder = mod.subfolder;
            }
            if (mod.title) {
              f.title = mod.title;
            }

            if (Array.isArray(mod.items)) {
              mod.items.forEach(item => {
                if (item.methods && Array.isArray(item.methods)) {
                  item.methods.forEach(mth => {
                    if (mth.status !== 'removed') fActive++;
                    if (mth.status === 'new') fAdded++;
                    if (mth.status === 'removed') fRemoved++;
                  });
                } else {
                  if (item.status !== 'removed') fActive++;
                  if (item.status === 'new') fAdded++;
                  if (item.status === 'removed') fRemoved++;
                }
              });
            }
          }

          f.count = fActive;
          f.added = fAdded;
          f.removed = fRemoved;

          catCount += fActive;
          catAdded += fAdded;
          catRemoved += fRemoved;
        });

        metric.count = catCount;
        metric.added = catAdded;
        metric.removed = catRemoved;

        secTotalCount += catCount;
        secTotalAdded += catAdded;
        secTotalRemoved += catRemoved;
      });

      section.totalCount = secTotalCount;
      section.totalAdded = secTotalAdded;
      section.totalRemoved = secTotalRemoved;
    }
  });

  return targetData;
}


let activeSourceCard = null;
let activeDependencyCards = [];
let activeReferenceCards = [];

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
    left: left,
    top: top,
    width: el.offsetWidth,
    height: el.offsetHeight,
    right: left + el.offsetWidth,
    bottom: top + el.offsetHeight
  };
}

function clearDependencyHighlighting() {
  const canvas = document.getElementById('canvas');
  if (!canvas) return;

  // Clear state classes on cards, anchors, and lane identifiers
  const dimmedElements = canvas.querySelectorAll('.is-dimmed, .is-active-source, .is-active-target, .is-active-dependency, .is-active-reference');
  dimmedElements.forEach(el => {
    el.classList.remove('is-active-source', 'is-active-target', 'is-active-dependency', 'is-active-reference', 'is-dimmed');
  });

  // Clear SVG path layer
  const connectionsLayer = document.getElementById('connectionsLayer');
  if (connectionsLayer) {
    connectionsLayer.innerHTML = '';
  }

  activeSourceCard = null;
  activeDependencyCards = [];
  activeReferenceCards = [];
}

function drawConnections(sourceCard, dependencyCards = [], referenceCards = []) {
  const canvas = document.getElementById('canvas');
  let connectionsLayer = document.getElementById('connectionsLayer');
  if (!canvas) return;

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

  // Draw Dependency Connections
  // Selected card ALWAYS exits from LEFT edge
  dependencyCards.forEach(targetCard => {
    const targetCoords = getCanvasCoords(targetCard, canvas);
    const targetCenter = {
      x: targetCoords.left + targetCoords.width / 2,
      y: targetCoords.top + targetCoords.height / 2
    };

    const deltaX = targetCenter.x - sourceCenter.x;
    const deltaY = targetCenter.y - sourceCenter.y;

    // Source exit anchor: strictly LEFT edge of selected card
    const x1 = sourceCoords.left;
    const y1 = sourceCenter.y;
    const cDistX = Math.max(Math.abs(targetCenter.x - sourceCenter.x) * 0.3, 30);
    const cDistY = Math.max(Math.abs(targetCenter.y - sourceCenter.y) * 0.3, 30);

    const cp1 = { x: x1 - cDistX, y: y1 };

    let x2, y2, cp2;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal dominant: target connects at RIGHT edge
      x2 = targetCoords.right;
      y2 = targetCenter.y;
      cp2 = { x: x2 + cDistX, y: y2 };
    } else {
      // Vertical dominant: target connects at TOP (if target below) or BOTTOM (if target above)
      x2 = targetCenter.x;
      if (deltaY > 0) {
        y2 = targetCoords.top;
        cp2 = { x: x2, y: y2 - cDistY };
      } else {
        y2 = targetCoords.bottom;
        cp2 = { x: x2, y: y2 + cDistY };
      }
    }

    const d = `M ${x1} ${y1} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${x2} ${y2}`;

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('class', 'connection-path dependency-path');
    connectionsLayer.appendChild(pathEl);
  });

  // Draw Reference Connections
  // Selected card ALWAYS exits from RIGHT edge
  referenceCards.forEach(refCard => {
    const refCoords = getCanvasCoords(refCard, canvas);
    const refCenter = {
      x: refCoords.left + refCoords.width / 2,
      y: refCoords.top + refCoords.height / 2
    };

    const deltaX = refCenter.x - sourceCenter.x;
    const deltaY = refCenter.y - sourceCenter.y;

    // Source exit anchor: strictly RIGHT edge of selected card
    const x1 = sourceCoords.right;
    const y1 = sourceCenter.y;
    const cDistX = Math.max(Math.abs(refCenter.x - sourceCenter.x) * 0.3, 30);
    const cDistY = Math.max(Math.abs(refCenter.y - sourceCenter.y) * 0.3, 30);

    const cp1 = { x: x1 + cDistX, y: y1 };

    let x2, y2, cp2;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal dominant: reference card connects at LEFT edge
      x2 = refCoords.left;
      y2 = refCenter.y;
      cp2 = { x: x2 - cDistX, y: y2 };
    } else {
      // Vertical dominant: reference card connects at TOP (if reference below) or BOTTOM (if reference above)
      x2 = refCenter.x;
      if (deltaY > 0) {
        y2 = refCoords.top;
        cp2 = { x: x2, y: y2 - cDistY };
      } else {
        y2 = refCoords.bottom;
        cp2 = { x: x2, y: y2 + cDistY };
      }
    }

    const d = `M ${x1} ${y1} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${x2} ${y2}`;

    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('class', 'connection-path reference-path');
    connectionsLayer.appendChild(pathEl);
  });
}

function setDependencyHighlighting(sourceCard) {
  clearDependencyHighlighting();

  const canvas = document.getElementById('canvas');
  if (!canvas || !sourceCard) return;

  activeSourceCard = sourceCard;
  sourceCard.classList.add('is-active-source');

  // Parse imports list from selected card data attribute
  let sourceImports = [];
  try {
    sourceImports = JSON.parse(sourceCard.dataset.imports || '[]');
  } catch (e) {
    console.warn('Could not parse card imports:', e);
  }

  const sourceModuleId = sourceCard.dataset.moduleId || '';
  const sourceCleanId = sourceModuleId.replace(/\.spec$/, '');

  const allCards = Array.from(canvas.querySelectorAll('.module-card'));
  const dependencyCards = [];
  const referenceCards = [];

  allCards.forEach(card => {
    if (card === sourceCard) return;
    const cardModuleId = card.dataset.moduleId || '';
    const cardCleanId = cardModuleId.replace(/\.spec$/, '');
    let cardImports = [];
    try {
      cardImports = JSON.parse(card.dataset.imports || '[]');
    } catch (e) { }

    // Helper matcher for module IDs and path aliases
    const matchesId = (impId, targetModId, targetCleanId) => {
      if (!impId) return false;
      if (impId === targetModId || impId === targetCleanId) return true;
      if (impId.replace(/\.spec$/, '') === targetCleanId) return true;
      if (impId.endsWith('/' + targetModId) || impId.endsWith('/' + targetCleanId)) return true;
      const baseName = targetModId.split('/').pop();
      if (impId.endsWith('/' + baseName) || impId === baseName) return true;
      return false;
    };

    // Check if card is a DEPENDENCY (selected card imports this card)
    const isDependency = sourceImports.some(impId => matchesId(impId, cardModuleId, cardCleanId));

    // Check if card is a REFERENCE (this card imports the selected card)
    const isReference = cardImports.some(impId => matchesId(impId, sourceModuleId, sourceCleanId));

    if (isDependency) {
      card.classList.add('is-active-dependency', 'is-active-target');
      dependencyCards.push(card);
    }

    if (isReference) {
      card.classList.add('is-active-reference');
      referenceCards.push(card);
    }
  });

  activeDependencyCards = dependencyCards;
  activeReferenceCards = referenceCards;

  // Dim all unrelated cards, section anchors, and lane badge containers
  const activeSet = new Set([sourceCard, ...dependencyCards, ...referenceCards]);
  allCards.forEach(card => {
    if (!activeSet.has(card)) {
      card.classList.add('is-dimmed');
    }
  });

  const sectionAnchors = canvas.querySelectorAll('.section-anchor');
  sectionAnchors.forEach(anchor => anchor.classList.add('is-dimmed'));

  const laneIdentifiers = canvas.querySelectorAll('.lane-identifiers');
  laneIdentifiers.forEach(laneId => laneId.classList.add('is-dimmed'));

  // 4. Draw SVG cubic Bezier connection lines
  if (dependencyCards.length > 0 || referenceCards.length > 0) {
    drawConnections(sourceCard, dependencyCards, referenceCards);
  }
}


function renderCanvas(data, config) {
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = '';

  // Ensure SVG connection layer exists inside canvas
  const connectionsLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connectionsLayer.id = 'connectionsLayer';
  connectionsLayer.classList.add('connections-layer');
  canvas.appendChild(connectionsLayer);

  data.forEach(section => {
    // Only render section if it has lanes containing modules
    const hasModules = section.lanes.some(lane => lane.modules.length > 0);
    if (hasModules) {
      const sectionHtml = SectionBlock(section, config);
      canvas.insertAdjacentHTML('beforeend', sectionHtml);
    }
  });

  if (canvas.children.length <= 1) { // 1 for connectionsLayer
    canvas.innerHTML = `
      <div style="padding: 100px; text-align: center; color: var(--color-text-muted);">
        <h1>No scanned modules found</h1>
        <p>Ensure mock folders are populated and sync-visualizer.js has run.</p>
      </div>
    `;
  }
}

async function init() {
  try {
    // Fetch config and ledger index
    const config = await fetchJSON('visualizer-config.json');
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

    // Prepare dropdown items list
    const selectItems = ledger.map((run, idx) => {
      const labelPrefix = run.label || 'snapshot';
      let timestampStr = run.timestamp;

      if (!timestampStr && run.file) {
        const match = run.file.match(/(\d{2}-\d{2}-\d{2}-\d{6})/);
        if (match) {
          timestampStr = match[1];
        }
      }

      const displayLabel = timestampStr ? `${labelPrefix}-${timestampStr}` : labelPrefix;

      return {
        value: idx,
        label: displayLabel
      };
    });

    // Default indices: Left = latest snapshot (0), Right = previous snapshot (1)
    let leftIndex = 0;
    let rightIndex = ledger.length > 1 ? 1 : 0;

    // Load and render diffed snapshot data
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

    // 2. Initialize Left Select Component (Target Snapshot)
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

    // 3. Initialize Right Select Component (Baseline Snapshot)
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

    // 4. Initial load with default left (0) vs right (1)
    await loadDiffView(leftIndex, rightIndex);

    // 5. Initialize viewport interactions
    initPanZoom('viewport', 'canvas');

    // 6. Interaction handler distinguishing click vs pan-drag & background deselection
    const viewport = document.getElementById('viewport');
    let mouseDownPos = { x: 0, y: 0 };

    viewport.addEventListener('mousedown', (e) => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
    });

    viewport.addEventListener('click', (e) => {
      // Ignore click if mouse moved > 5px (canvas pan-drag gesture)
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      if (dist > 5) return;

      // Ignore clicks inside control panel
      if (e.target.closest('.control-panel')) return;

      const card = e.target.closest('.module-card');
      if (card) {
        if (activeSourceCard === card) {
          clearDependencyHighlighting();
        } else {
          setDependencyHighlighting(card);
        }
      } else {
        // Clicked open space -> deselect active selection if one exists
        if (activeSourceCard) {
          clearDependencyHighlighting();
        }
      }
    });

    // Window resize event handler to recalculate paths
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

