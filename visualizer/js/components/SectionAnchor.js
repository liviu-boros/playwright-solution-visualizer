import { SummaryCard } from './SummaryCard.js';
import { BreakdownCard } from './BreakdownCard.js';

// Normalizes directory path strings for consistent config lookups
function normalizeFolder(folder) {
  if (!folder) return '';
  return folder.trim().toLowerCase().replace(/^\.\//, '').replace(/\/$/, '');
}

// Groups file items by their subfolder category
function groupFilesBySubfolder(files = []) {
  const folderMap = new Map();
  for (const f of files) {
    const folder = (f.subfolder || 'ROOT').toUpperCase();
    if (!folderMap.has(folder)) {
      folderMap.set(folder, { folder, count: 0, added: 0, removed: 0, files: [] });
    }
    const grp = folderMap.get(folder);
    grp.count += (f.count || 0);
    grp.added += (f.added || 0);
    grp.removed += (f.removed || 0);
    grp.files.push(f);
  }
  return Array.from(folderMap.values());
}

// Builds top KPI summary cards array
function buildSummaryCards(section, isTestSection) {
  const cards = [
    SummaryCard({
      count: section.totalCount || 0,
      label: 'Total',
      added: section.totalAdded || 0,
      removed: section.totalRemoved || 0
    })
  ];

  if (!isTestSection || !Array.isArray(section.metrics)) {
    return cards;
  }

  for (const m of section.metrics) {
    cards.push(SummaryCard({
      count: m.count || 0,
      label: m.label,
      added: m.added || 0,
      removed: m.removed || 0
    }));
  }
  return cards;
}

// Builds breakdown metric cards array
function buildBreakdownCards(section, isTestSection) {
  if (!Array.isArray(section.metrics) || section.metrics.length === 0) {
    return [];
  }

  if (isTestSection) {
    return section.metrics.map(m => BreakdownCard({
      title: m.label,
      groups: groupFilesBySubfolder(m.files)
    }));
  }

  return [BreakdownCard({ items: section.metrics })];
}

// Renders the section anchor card with metadata and summary metrics
export function SectionAnchor(section, config) {
  const cfg = config?.scanConfig?.find(item => {
    const itemDir = normalizeFolder(item.dir || item.folder);
    const sFolder = normalizeFolder(section.folder || section.dir);
    if (itemDir && sFolder && itemDir === sFolder) return true;
    const sTitle = (section.title || section.name || '').toLowerCase();
    return Boolean(item.name && sTitle && item.name.toLowerCase() === sTitle);
  });

  const displayTitle = cfg?.name || section.title;
  const displayFolder = cfg?.dir || section.folder || `./${displayTitle.toLowerCase().replace(/\s+/g, '')}`;
  const displayDescription = cfg?.description !== undefined ? cfg.description : (section.description || '');
  const iconUrl = cfg?.icon || section.icon || 'icons/tests.svg';
  const isTestSection = (displayTitle || '').toLowerCase().includes('test') || (cfg?.type === 'test');

  const summaryCards = buildSummaryCards(section, isTestSection);
  const breakdownCards = buildBreakdownCards(section, isTestSection);

  const breakdownSectionHtml = breakdownCards.length > 0 ? `
    <div class="breakdown-divider">
      <span class="breakdown-divider-line"></span>
      <span class="breakdown-divider-text">BREAKDOWN</span>
      <span class="breakdown-divider-line"></span>
    </div>
    <div class="breakdown-cards-row">
      ${breakdownCards.join('')}
    </div>
  ` : '';

  return `
    <div class="section-anchor">
      <div class="anchor-meta-col">
        <span class="icon icon--lg" style="mask: url('${iconUrl}') no-repeat center / contain; -webkit-mask: url('${iconUrl}') no-repeat center / contain; background-color: var(--pr-color-white);" aria-hidden="true"></span>
        <div class="anchor-title-group">
          <h2 class="anchor-title">${displayTitle}</h2>
          <span class="anchor-folder">${displayFolder}</span>
        </div>
        <p class="anchor-description">${displayDescription}</p>
      </div>

      <div class="anchor-metrics-col">
        <div class="summary-cards-row">
          ${summaryCards.join('')}
        </div>
        ${breakdownSectionHtml}
      </div>
    </div>
  `;
}
