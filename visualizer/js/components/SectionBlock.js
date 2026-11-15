import { ModuleCard } from './ModuleCard.js';
import { SectionAnchor } from './SectionAnchor.js';

// Normalizes directory path strings
function normalizeFolder(folder) {
  if (!folder) return '';
  return folder.trim().toLowerCase().replace(/^\.\//, '').replace(/\/$/, '');
}

// Finds matching section definition from visualizer-config.json
export function findConfigSection(section, config) {
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

// Resolves the section data type (test, class, functions)
export function getSectionType(sectionOrTitle, config) {
  const sectionObj = typeof sectionOrTitle === 'object' ? sectionOrTitle : { title: sectionOrTitle };
  const found = findConfigSection(sectionObj, config);
  if (found?.type) return found.type;

  const title = (sectionObj.title || '').toLowerCase();
  return (title === 'tests' || title.includes('test')) ? 'test' : 'class';
}

// Resolves tag icon SVG path from config
function getTagIcon(tagIdentifier, config) {
  if (!config || !Array.isArray(config.tags) || !tagIdentifier) return '';
  const found = config.tags.find(
    t => t.displayName === tagIdentifier || (t.name && t.name.toLowerCase() === tagIdentifier.toLowerCase())
  );
  return found ? found.icon : '';
}

// Renders an individual side rail badge
function renderLaneBadge(badge, config) {
  if (badge.type === 'tag') {
    const symbolId = `icon-tag-${(badge.value || '').toLowerCase()}`;
    return `
      <div class="side-badge" title="Project: ${badge.value}">
        <svg class="icon icon--badge" aria-hidden="true"><use href="#${symbolId}" /></svg>
        <span class="badge-text">${badge.value}</span>
      </div>
    `;
  }
  return `
    <div class="side-badge" title="Subfolder: ${badge.value}">
      <span class="badge-text">${badge.value}</span>
    </div>
  `;
}

// Renders vertical side rail tag badges for a lane row
function renderLaneBadges(laneBadges, config) {
  if (!laneBadges || laneBadges.length === 0) return '';
  return `
    <div class="lane-identifiers">
      ${laneBadges.map(b => renderLaneBadge(b, config)).join('')}
    </div>
  `;
}

// Resolves the subfolder label for a lane from its subfolder field or lane badges
function getLaneSubfolder(lane) {
  if (lane?.subfolder) return lane.subfolder;
  const subBadge = (lane?.laneBadges || []).find(b => b.type === 'subfolder' || b.type === 'folder');
  return subBadge?.value || 'ROOT';
}

// Renders a lane row with its side badges and module cards
function renderLane(lane, config) {
  const laneSubfolder = getLaneSubfolder(lane);
  return `
    <div class="lane-row" data-subfolder="${laneSubfolder}">
      ${renderLaneBadges(lane.laneBadges, config)}
      <div class="lane-content">
        ${lane.modules.map(ModuleCard).join('')}
      </div>
    </div>
  `;
}

// Renders a full section subgrid block (hero title, anchor, divider, and lanes)
export function SectionBlock(section, config) {
  const cfg = findConfigSection(section, config);
  const displayTitle = cfg?.name || section.title;
  const sectionFolder = normalizeFolder(section.folder || cfg?.dir || section.title);
  const lanesHtml = (section.lanes || []).map(lane => renderLane(lane, config)).join('');

  return `
    <div class="section-container" data-section="${displayTitle}" data-section-folder="${sectionFolder}">
      <div class="section-hero-title">${displayTitle}</div>
      ${SectionAnchor(section, config)}
      <div class="section-divider-line"></div>
      <div class="section-lanes">
        ${lanesHtml}
      </div>
    </div>
  `;
}
