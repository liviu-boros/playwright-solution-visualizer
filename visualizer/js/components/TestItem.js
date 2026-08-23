// Resolves status flag or default item symbol
function getTestMarker(status, itemType) {
  if (status === 'removed') {
    return `<span class="flag flag--removed" aria-hidden="true" title="Removed test in snapshot"><span class="icon icon--flag icon--removed"></span></span>`;
  }
  if (status === 'new') {
    return `<span class="flag flag--new" aria-hidden="true" title="New item in snapshot"><span class="icon icon--flag icon--priority"></span></span>`;
  }
  if (itemType === 'functions' || itemType === 'class') {
    return `<span class="icon-code">{}</span>`;
  }
  return `<span class="icon icon--arrow" aria-hidden="true"></span>`;
}

// Renders a test item row with arrow/status indicator and test name
export function TestItem(item, itemType) {
  const marker = getTestMarker(item.status, itemType);
  const classes = [
    'test-item',
    item.status === 'removed' && 'test-item--removed'
  ].filter(Boolean).join(' ');

  return `
    <div class="${classes}">
      ${marker}
      <span class="item-text">${item.name}</span>
    </div>
  `;
}
