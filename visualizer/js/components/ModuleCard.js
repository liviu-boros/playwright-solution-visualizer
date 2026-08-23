import { TestItem } from './TestItem.js';
import { MethodItem } from './MethodItem.js';

// Renders status flag for added or removed modules
function renderCardFlag(status) {
  if (status === 'removed') {
    return `<div class="badge-right"><span class="flag flag--removed module-flag" aria-hidden="true" title="Removed module in snapshot"><span class="icon icon--flag icon--removed"></span></span></div>`;
  }
  if (status === 'new') {
    return `<div class="badge-right"><span class="flag flag--new module-flag" aria-hidden="true" title="New module in snapshot"><span class="icon icon--flag icon--priority"></span></span></div>`;
  }
  return '';
}

// Renders a class container with its member methods
function renderClassItem(item) {
  if (!item.methods || !Array.isArray(item.methods)) {
    return MethodItem(item, 'method');
  }

  const parentRow = `
    <div class="class-parent-row">
      <span class="icon icon--class" aria-hidden="true"></span>
      <span class="class-name">${item.name}</span>
    </div>
  `;
  const methodsHtml = item.methods.map(m => MethodItem(m, 'method', true)).join('');
  return `<div class="class-group">${parentRow}${methodsHtml}</div>`;
}

// Renders the list of items based on module classification
function renderModuleItems(mod) {
  const items = mod.items || [];
  if (mod.itemType === 'class') {
    return items.map(renderClassItem).join('');
  }
  if (mod.itemType === 'functions') {
    return items.map(item => MethodItem(item, 'function')).join('');
  }
  return items.map(item => TestItem(item, mod.itemType)).join('');
}

// Renders an individual module card with tags, title, methods/tests, and import metadata
export function ModuleCard(mod) {
  const tags = mod.tags || [];
  const tagsHtml = tags.length > 0
    ? `<div class="badge-left">${tags.map(t => `<span class="badge badge--muted">${t}</span>`).join('')}</div>`
    : '';

  const flagHtml = renderCardFlag(mod.status);
  const badgeRowHtml = `<div class="badge-row">${tagsHtml}${flagHtml}</div>`;
  const itemsHtml = renderModuleItems(mod);

  const displayTitle = (mod.title || '').replace(/(\.spec| Spec)$/i, '');
  const displaySubtitle = mod.fileName || mod.id;
  const importsJson = JSON.stringify(mod.imports || []);
  const removedClass = mod.status === 'removed' ? ' module-card--removed' : '';

  return `
    <div class="module-card ambient-spotlight${removedClass}" data-module-id="${mod.id}" data-imports='${importsJson}'>
      <div class="card-header">
        ${badgeRowHtml}
        <h2 class="card-title">${displayTitle}</h2>
        <p class="card-subtitle">${displaySubtitle}</p>
      </div>
      <div class="card-body">
        ${itemsHtml}
      </div>
    </div>
  `;
}
