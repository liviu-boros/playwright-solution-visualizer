// js/ModuleCard.js
import { TestItem } from './TestItem.js';
import { MethodItem } from './MethodItem.js';

export function ModuleCard(mod) {
  const tagsHtml = mod.tags && mod.tags.length > 0 
    ? `<div class="badge-left">${mod.tags.map(t => `<span class="badge badge--muted">${t}</span>`).join('')}</div>`
    : '';

  let flagHtml = '';
  if (mod.status === 'removed') {
    flagHtml = `<div class="badge-right"><span class="flag flag--removed module-flag" aria-hidden="true" title="Removed module in snapshot"><span class="icon icon--flag icon--removed"></span></span></div>`;
  } else if (mod.status === 'new') {
    flagHtml = `<div class="badge-right"><span class="flag flag--new module-flag" aria-hidden="true" title="New module in snapshot"><span class="icon icon--flag icon--priority"></span></span></div>`;
  }

  const badgeRowHtml = `<div class="badge-row">${tagsHtml}${flagHtml}</div>`;

  let itemsHtml = '';
  if (mod.itemType === 'class') {
    itemsHtml = mod.items.map(item => {
      if (item.methods && Array.isArray(item.methods)) {
        const parentRow = `
          <div class="class-parent-row">
            <span class="icon icon--class" aria-hidden="true"></span>
            <span class="class-name">${item.name}</span>
          </div>
        `;
        const methodsHtml = item.methods.map(m => MethodItem(m, 'method', true)).join('');
        return `<div class="class-group">${parentRow}${methodsHtml}</div>`;
      } else {
        return MethodItem(item, 'method');
      }
    }).join('');
  } else if (mod.itemType === 'functions') {
    itemsHtml = mod.items.map(item => MethodItem(item, 'function')).join('');
  } else {
    itemsHtml = mod.items.map(item => TestItem(item, mod.itemType)).join('');
  }

  const displayTitle = (mod.title || '').replace(/(\.spec| Spec)$/i, '');
  const displaySubtitle = mod.fileName || mod.id;

  const importsJson = JSON.stringify(mod.imports || []);

  return `
    <div class="module-card corner-ticks ambient-spotlight${mod.status === 'removed' ? ' module-card--removed' : ''}" data-module-id="${mod.id}" data-imports='${importsJson}'>
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
