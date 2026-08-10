// js/MethodItem.js
export function MethodItem(item, itemType, isIndented = false) {
  const iconClass = (itemType === 'function' || itemType === 'functions') ? 'icon icon--function' : 'icon icon--method';
  let marker = `<span class="${iconClass}" aria-hidden="true"></span>`;
  let itemClasses = 'method-item';
  if (isIndented) {
    itemClasses += ' method-item--indented';
  }
  
  if (item.status === 'removed') {
    marker = `<span class="flag flag--removed" aria-hidden="true" title="Removed item in snapshot"><span class="icon icon--flag icon--removed"></span></span>`;
    itemClasses += ' method-item--removed';
  } else if (item.status === 'new') {
    marker = `<span class="flag flag--new" aria-hidden="true" title="New item in snapshot"><span class="icon icon--flag icon--priority"></span></span>`;
  }

  return `
    <div class="${itemClasses}">
      ${marker}
      <span class="item-text">${item.name}</span>
    </div>
  `;
}
