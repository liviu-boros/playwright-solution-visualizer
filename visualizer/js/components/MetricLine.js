// Builds diff additions and removals pill markup
function getDiffHtml(added, removed) {
  if (!added && !removed) return '';
  const parts = [];
  if (removed > 0) parts.push(`<span class="diff-removed">-${removed}</span>`);
  if (added > 0) parts.push(`<span class="diff-added">+${added}</span>`);
  return `<span class="metric-diff-group">${parts.join(' ')}</span>`;
}

// Determines CSS variant type
function getVariant(isFolder, isIndented) {
  if (isFolder) return 'folder';
  if (isIndented) return 'indented';
  return 'standard';
}

// Renders a metric breakdown row with label, diff changes, and count
export function MetricLine({
  label,
  count,
  added = 0,
  removed = 0,
  isFolder = false,
  isIndented = false
}) {
  const diffHtml = getDiffHtml(added, removed);
  const variant = getVariant(isFolder, isIndented);

  return `
    <div class="metric-line metric-line--${variant}">
      <span class="metric-line-label">${label}</span>
      <div class="metric-line-data">
        ${diffHtml}
        <span class="metric-line-count metric-line-count--${variant}">${count}</span>
      </div>
    </div>
  `;
}
