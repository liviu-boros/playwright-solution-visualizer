// js/SectionBlock.js
import { ModuleCard } from './ModuleCard.js';

function getTagIcon(tagIdentifier, config) {
  if (!config || !Array.isArray(config.tags) || !tagIdentifier) return '';
  const found = config.tags.find(
    t => t.displayName === tagIdentifier || (t.name && t.name.toLowerCase() === tagIdentifier.toLowerCase())
  );
  return found ? found.icon : '';
}

function renderLaneBadges(laneBadges, config) {
  if (!laneBadges || laneBadges.length === 0) {
    return '';
  }

  return `
    <div class="lane-identifiers">
      ${laneBadges.map(badge => {
        if (badge.type === 'tag') {
          const iconPath = getTagIcon(badge.value, config);
          return `
            <div class="side-badge rail-ticks" title="Project: ${badge.value}">
              <span class="icon icon--badge" style="mask: url('${iconPath}') no-repeat center / contain; -webkit-mask: url('${iconPath}') no-repeat center / contain;" aria-hidden="true"></span>
              <span class="badge-text">${badge.value}</span>
            </div>
          `;
        } else {
          return `
            <div class="side-badge rail-ticks" title="Subfolder: ${badge.value}">
              <span class="badge-text">${badge.value}</span>
            </div>
          `;
        }
      }).join('')}
    </div>
  `;
}

function getFileSubfolder(f) {
  return f.subfolder || 'ROOT';
}

export function getSectionType(sectionTitle, config) {
  if (config && Array.isArray(config.scanConfig)) {
    const found = config.scanConfig.find(item => item.name === sectionTitle);
    if (found && found.type) return found.type;
  }
  return (sectionTitle === 'Tests') ? 'test' : 'class';
}

function renderSummaryMetrics(section) {
  const totalCount = section.totalCount || 0;
  const totalAdded = section.totalAdded || 0;
  const totalRemoved = section.totalRemoved || 0;

  const totalAddedText = (totalAdded > 0)
    ? `<span class="metric-diff-added" title="${totalAdded} added">+${totalAdded}</span>`
    : '';
  const totalRemovedText = (totalRemoved > 0)
    ? `<span class="metric-diff-removed" title="${totalRemoved} removed">-${totalRemoved}</span>`
    : '';

  const totalLabel = section.totalLabel || `Total ${section.title}`;
  const totalLineHtml = `
    <div class="metric-line metric-line--total">
      <div class="metric-label-wrapper">
        <span class="metric-lbl total-metric-lbl">${totalLabel}</span>
      </div>
      <div class="metric-badges-container">
        ${totalAddedText}
        ${totalRemovedText}
        <div class="badge badge--medium">${totalCount}</div>
      </div>
    </div>
  `;

  if (!section.metrics || section.metrics.length === 0) {
    return `
      <div class="anchor-metrics">
        ${totalLineHtml}
      </div>
    `;
  }

  const summaryRowsHtml = section.metrics.map(m => {
    const addedText = (m.added && m.added > 0)
      ? `<span class="metric-diff-added" title="${m.added} added">+${m.added}</span>`
      : '';
    const removedText = (m.removed && m.removed > 0)
      ? `<span class="metric-diff-removed" title="${m.removed} removed">-${m.removed}</span>`
      : '';

    return `
      <div class="metric-line metric-line--summary">
        <div class="metric-label-wrapper">
          <span class="metric-folder-title">${m.label}</span>
        </div>
        <div class="metric-badges-container">
          ${addedText}
          ${removedText}
          <div class="badge badge--secondary">${m.count}</div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="anchor-metrics">
      ${totalLineHtml}
      <div class="metric-summary-list">
        ${summaryRowsHtml}
      </div>
    </div>
  `;
}

function renderTestMetrics(section) {
  const totalCount = section.totalCount || section.metrics.reduce((sum, m) => sum + m.count, 0);
  const totalAdded = section.totalAdded || section.metrics.reduce((sum, m) => sum + (m.added || 0), 0);
  const totalRemoved = section.totalRemoved || section.metrics.reduce((sum, m) => sum + (m.removed || 0), 0);

  const totalAddedText = (totalAdded > 0)
    ? `<span class="metric-diff-added" title="${totalAdded} total tests added">+${totalAdded}</span>`
    : '';
  const totalRemovedText = (totalRemoved > 0)
    ? `<span class="metric-diff-removed" title="${totalRemoved} total tests removed">-${totalRemoved}</span>`
    : '';

  const totalLabel = section.totalLabel || 'Total Tests';
  const totalLineHtml = `
    <div class="metric-line metric-line--total">
      <div class="metric-label-wrapper">
        <span class="metric-lbl total-metric-lbl">${totalLabel}</span>
      </div>
      <div class="metric-badges-container">
        ${totalAddedText}
        ${totalRemovedText}
        <div class="badge badge--medium">${totalCount}</div>
      </div>
    </div>
  `;

  const categoryLinesHtml = section.metrics.map(m => {
    const addedText = (m.added && m.added > 0)
      ? `<span class="metric-diff-added" title="${m.added} tests added">+${m.added}</span>`
      : '';
    const removedText = (m.removed && m.removed > 0)
      ? `<span class="metric-diff-removed" title="${m.removed} tests removed">-${m.removed}</span>`
      : '';

    let breakdownHtml = '';

    if (m.files && m.files.length > 0) {
      const folderMap = new Map();
      m.files.forEach(f => {
        const folderName = getFileSubfolder(f);
        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, []);
        }
        folderMap.get(folderName).push(f);
      });

      const folderBlocksHtml = Array.from(folderMap.entries()).map(([folderName, files]) => {
        const folderCount = files.reduce((sum, f) => sum + (f.count || 0), 0);
        const folderAdded = files.reduce((sum, f) => sum + (f.added || 0), 0);
        const folderRemoved = files.reduce((sum, f) => sum + (f.removed || 0), 0);

        const folderAddedText = (folderAdded > 0)
          ? `<span class="metric-diff-added" title="${folderAdded} tests added">+${folderAdded}</span>`
          : '';
        const folderRemovedText = (folderRemoved > 0)
          ? `<span class="metric-diff-removed" title="${folderRemoved} tests removed">-${folderRemoved}</span>`
          : '';

        const filesListHtml = files.map(f => {
          const fAddedText = (f.added && f.added > 0)
            ? `<span class="metric-diff-added" title="${f.added} tests added">+${f.added}</span>`
            : '';
          const fRemovedText = (f.removed && f.removed > 0)
            ? `<span class="metric-diff-removed" title="${f.removed} tests removed">-${f.removed}</span>`
            : '';
          const specTitle = f.title || f.fileName;
          return `
            <div class="metric-line metric-line--file">
              <span class="metric-file-title" title="${f.fileName}">${specTitle}</span>
              <div class="metric-badges-container">
                ${fAddedText}
                ${fRemovedText}
                <div class="badge badge--clear">${f.count}</div>
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="metric-folder-block">
            <div class="metric-line metric-line--folder">
              <div class="metric-label-wrapper">
                <span class="metric-folder-title">${folderName}</span>
              </div>
              <div class="metric-badges-container">
                ${folderAddedText}
                ${folderRemovedText}
                <div class="badge badge--secondary">${folderCount}</div>
              </div>
            </div>
            <div class="metric-tree-list metric-tree-list--files">
              ${filesListHtml}
            </div>
          </div>
        `;
      }).join('');

      breakdownHtml = `<div class="metric-tree-list metric-tree-list--folders">${folderBlocksHtml}</div>`;
    }

    return `
      <div class="metric-category-block">
        <div class="metric-line category-metric-line">
          <div class="metric-label-wrapper">
            <span class="metric-lbl">${m.label}</span>
          </div>
          <div class="metric-badges-container">
            ${addedText}
            ${removedText}
            <div class="badge">${m.count}</div>
          </div>
        </div>
        ${breakdownHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="anchor-metrics">
      ${totalLineHtml}
      ${categoryLinesHtml}
    </div>
  `;
}

function renderMasterAnchor(section, config) {
  let metricsHtml = '';
  const secType = getSectionType(section.title, config);

  if (secType === 'test') {
    if (section.metrics && section.metrics.length > 0) {
      metricsHtml = renderTestMetrics(section);
    }
  } else {
    metricsHtml = renderSummaryMetrics(section);
  }

  return `
    <div class="section-anchor corner-ticks">
      <span class="icon icon--lg" style="mask: url('${section.icon}') no-repeat center / contain; -webkit-mask: url('${section.icon}') no-repeat center / contain;" aria-hidden="true"></span>
      <h1 class="anchor-title">${section.title}</h1>
      <p class="anchor-path">${section.folder}</p>
      <p class="anchor-desc">${section.description}</p>
      ${metricsHtml}
    </div>
  `;
}

export function SectionBlock(section, config) {
  const lanesHtml = section.lanes.map(lane => `
    <div class="lane-row">
      ${renderLaneBadges(lane.laneBadges, config)}
      <div class="lane-content">
        ${lane.modules.map(mod => ModuleCard(mod)).join('')}
      </div>
    </div>
  `).join('');

  return `
    <div class="section-container">
      ${renderMasterAnchor(section, config)}
      <div class="section-lanes">${lanesHtml}</div>
    </div>
  `;
}
