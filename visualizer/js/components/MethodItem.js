// Resolves status flag or default type icon
function getMethodMarker(status, itemType) {
  if (status === 'removed') {
    return `<span class="flag flag--removed" aria-hidden="true" title="Removed item in snapshot"><span class="icon icon--flag icon--removed"></span></span>`;
  }
  if (status === 'new') {
    return `<span class="flag flag--new" aria-hidden="true" title="New item in snapshot"><span class="icon icon--flag icon--priority"></span></span>`;
  }
  const isFunc = itemType === 'function' || itemType === 'functions';
  const iconClass = isFunc ? 'icon icon--function' : 'icon icon--method';
  return `<span class="${iconClass}" aria-hidden="true"></span>`;
}

// Renders a class method or standalone function entry with status flags
export function MethodItem(item, itemType, isIndented = false) {
  const marker = getMethodMarker(item.status, itemType);
  const classes = [
    'method-item',
    isIndented && 'method-item--indented',
    item.status === 'removed' && 'method-item--removed'
  ].filter(Boolean).join(' ');

  return `
    <div class="${classes}">
      ${marker}
      <span class="item-text">${item.name}</span>
    </div>
  `;
}
