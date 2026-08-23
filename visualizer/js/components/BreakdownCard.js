import { MetricLine } from './MetricLine.js';

// Renders a single nested folder group with subfile lines
function renderGroup(group) {
  const folderHeader = MetricLine({
    label: group.folder,
    count: group.count,
    added: group.added,
    removed: group.removed,
    isFolder: true
  });

  const fileLines = (group.files || []).map(f => MetricLine({
    label: f.title || f.fileName || f.id,
    count: f.count,
    added: f.added,
    removed: f.removed,
    isIndented: true
  })).join('');

  return `
    <div class="breakdown-group">
      ${folderHeader}
      <div class="breakdown-group-items">
        ${fileLines}
      </div>
    </div>
  `;
}

// Renders a list of flat metric lines
function renderFlatItems(items) {
  return items.map(item => MetricLine({
    label: item.label,
    count: item.count,
    added: item.added,
    removed: item.removed
  })).join('');
}

// Renders flat tag metrics or nested folder tree breakdown cards
export function BreakdownCard({ title, groups = [], items = [] }) {
  const isNested = groups.length > 0;
  const cardVariant = isNested ? 'breakdown-card--nested' : 'breakdown-card--flat';
  const contentVariant = isNested ? 'breakdown-card-content--nested' : 'breakdown-card-content--flat';

  const contentHtml = isNested
    ? groups.map(renderGroup).join('')
    : renderFlatItems(items);

  return `
    <div class="breakdown-card ${cardVariant}">
      ${title ? `<div class="breakdown-card-title">${title}</div>` : ''}
      <div class="breakdown-card-content ${contentVariant}">
        ${contentHtml}
      </div>
    </div>
  `;
}
