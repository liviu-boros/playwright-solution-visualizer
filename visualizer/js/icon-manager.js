// Dynamic SVG Sprite Sheet Manager for Hardware-Accelerated Vector Rendering
const iconSymbolMap = new Map();
let spriteSheetEl = null;

// System icons registry with local file paths
const SYSTEM_ICONS = {
  'icon-arrow': 'icons/system/arrow_right_24dp.svg',
  'icon-class': 'icons/system/class-24dp.svg',
  'icon-function': 'icons/system/function-24dp.svg',
  'icon-method': 'icons/system/method-24dp.svg',
  'icon-priority': 'icons/system/priority_high_24dp.svg',
  'icon-removed': 'icons/system/removed_24dp.svg'
};

// Ensures the hidden SVG sprite sheet exists in the DOM
function getOrCreateSpriteSheetDefs() {
  if (!spriteSheetEl) {
    spriteSheetEl = document.getElementById('svgSpriteSheet');
    if (!spriteSheetEl) {
      spriteSheetEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      spriteSheetEl.id = 'svgSpriteSheet';
      spriteSheetEl.style.display = 'none';
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      spriteSheetEl.appendChild(defs);
      document.body.prepend(spriteSheetEl);
    }
  }
  return spriteSheetEl.querySelector('defs') || spriteSheetEl;
}

// Fetches an SVG file, converts it into a <symbol>, and appends it to the sprite sheet
export async function registerSvgIcon(symbolId, url) {
  if (!url || iconSymbolMap.has(url)) return iconSymbolMap.get(url) || symbolId;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    const viewBox = svg.getAttribute('viewBox') || '0 0 24 24';
    const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'symbol');
    symbol.id = symbolId;
    symbol.setAttribute('viewBox', viewBox);

    // Clone child element nodes (paths, polygons, rects) and normalize fill
    Array.from(svg.childNodes).forEach(node => {
      if (node.nodeType === 1) {
        const clone = node.cloneNode(true);
        if (clone.getAttribute('fill') && clone.getAttribute('fill') !== 'none') {
          clone.setAttribute('fill', 'currentColor');
        }
        symbol.appendChild(clone);
      }
    });

    const defs = getOrCreateSpriteSheetDefs();
    defs.appendChild(symbol);
    iconSymbolMap.set(url, symbolId);
    return symbolId;
  } catch (err) {
    console.warn(`[IconManager] Failed to load SVG icon from ${url}:`, err);
    return null;
  }
}

// Initializes all system icons and icons defined in visualizer-config.json
export async function initIconManager(config) {
  const promises = [];

  // Register system icons
  for (const [id, url] of Object.entries(SYSTEM_ICONS)) {
    promises.push(registerSvgIcon(id, url));
  }

  // Register tag icons dynamically from config
  if (Array.isArray(config?.tags)) {
    for (const tag of config.tags) {
      if (tag.icon) {
        const symbolId = `icon-tag-${(tag.name || tag.displayName || '').toLowerCase()}`;
        promises.push(registerSvgIcon(symbolId, tag.icon));
      }
    }
  }

  // Register section icons dynamically from config
  if (Array.isArray(config?.scanConfig)) {
    for (const item of config.scanConfig) {
      if (item.icon) {
        const base = item.icon.split('/').pop().replace(/\.svg$/, '').toLowerCase();
        const symbolId = `icon-section-${base}`;
        promises.push(registerSvgIcon(symbolId, item.icon));
      }
    }
  }

  await Promise.all(promises);
}
