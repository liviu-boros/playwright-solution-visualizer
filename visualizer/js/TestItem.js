// js/TestItem.js
export function TestItem(item, itemType) {
  let marker = `<span class="icon icon--arrow" aria-hidden="true"></span>`;
  let itemClasses = 'test-item';
  
  if (item.status === 'removed') {
    marker = `<span class="flag flag--removed" aria-hidden="true" title="Removed test in snapshot"><span class="icon icon--flag icon--removed"></span></span>`;
    itemClasses += ' test-item--removed';
  } else if (item.status === 'new') {
    marker = `<span class="flag flag--new" aria-hidden="true" title="New test in snapshot"><span class="icon icon--flag icon--priority"></span></span>`;
  } else if (itemType === 'functions' || itemType === 'class') {
    marker = `<span class="icon-code">{}</span>`;
  }

  return `
    <div class="${itemClasses}">
      ${marker}
      <span class="item-text">${item.name}</span>
    </div>
  `;
}
