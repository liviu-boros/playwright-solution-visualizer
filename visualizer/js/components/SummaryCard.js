// Renders a summary KPI card with count, label, and footer diff indicators
export function SummaryCard({ count, label, added = 0, removed = 0 }) {
  let diffHtml = '<span class="summary-diff-neutral">-</span>';
  if (added > 0 || removed > 0) {
    const parts = [];
    if (removed > 0) parts.push(`<span class="diff-removed">-${removed}</span>`);
    if (added > 0) parts.push(`<span class="diff-added">+${added}</span>`);
    diffHtml = parts.join(' ');
  }

  return `
    <div class="summary-card">
      <div class="summary-card-main">
        <div class="summary-card-count">${count}</div>
        <div class="summary-card-label">${label}</div>
      </div>
      <div class="summary-card-footer">
        <div class="summary-card-diff">${diffHtml}</div>
      </div>
    </div>
  `;
}
