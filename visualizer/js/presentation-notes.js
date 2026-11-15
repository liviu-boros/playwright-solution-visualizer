/**
 * Presentation Notes Client-Side Module
 * Loads and parses sprint/presentation markdown notes independently at runtime.
 */

/**
 * Escapes HTML characters to prevent XSS and rendering issues.
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  if (!str) return '';
  return escapeHtml(str).replace(/"/g, '&quot;');
}

/**
 * Parses inline markdown tokens (code, strong, em, images, links).
 * @param {string} text 
 * @returns {string}
 */
export function parseInline(text) {
  if (!text) return '';

  // 1. Extract and protect inline code tokens
  const codeTokens = [];
  let processed = text.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `@@CODETOKEN${codeTokens.length}@@`;
    codeTokens.push(`<code class="presentation-code">${escapeHtml(code)}</code>`);
    return token;
  });

  // 2. Escape HTML on text outside code tokens
  processed = escapeHtml(processed);

  // 3. Inline images: ![alt](url)
  processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    return `<img class="presentation-image" src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" />`;
  });

  // 4. Links: [label](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
    return `<a class="presentation-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // 5. Bold: **text** or __text__
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong class="presentation-strong">$1</strong>');
  processed = processed.replace(/__([^_]+)__/g, '<strong class="presentation-strong">$1</strong>');

  // 6. Italic: *text* or _text_
  processed = processed.replace(/\*([^*]+)\*/g, '<em class="presentation-em">$1</em>');
  processed = processed.replace(/_([^_]+)_/g, '<em class="presentation-em">$1</em>');

  // 7. Restore inline code tokens
  codeTokens.forEach((codeHtml, idx) => {
    processed = processed.replace(`@@CODETOKEN${idx}@@`, codeHtml);
  });

  return processed;
}

/**
 * Parses markdown source into semantic HTML with presentation CSS classes.
 * @param {string} markdown 
 * @returns {string}
 */
export function parseMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const htmlParts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block (```)
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // Consume closing fence
      htmlParts.push(`<pre class="presentation-pre"><code class="presentation-code-block">${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Standalone image: ![alt](url)
    const standaloneImgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (standaloneImgMatch) {
      const alt = standaloneImgMatch[1];
      const url = standaloneImgMatch[2];
      htmlParts.push(`<div class="presentation-image-wrapper"><img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" class="presentation-image" /></div>`);
      i++;
      continue;
    }

    // Headings: #, ##, ###, ####, #####, ######
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      htmlParts.push(`<h${level} class="presentation-heading presentation-heading--${level}">${parseInline(content)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule: --- or *** or ___
    if (/^(?:---|\*\*\*|___)\s*$/.test(line.trim())) {
      htmlParts.push('<hr class="presentation-hr" />');
      i++;
      continue;
    }

    // Blockquotes: > text
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const quoteText = quoteLines.join(' ');
      htmlParts.push(`<blockquote class="presentation-quote"><p class="presentation-quote-text">${parseInline(quoteText)}</p></blockquote>`);
      continue;
    }

    // Unordered lists: * or - or +
    if (/^[\*\-\+]\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[\*\-\+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\*\-\+]\s+/, ''));
        i++;
      }
      const listItemsHtml = items
        .map(item => `<li class="presentation-list-item">${parseInline(item)}</li>`)
        .join('');
      htmlParts.push(`<ul class="presentation-list">${listItemsHtml}</ul>`);
      continue;
    }

    // Ordered lists: 1. or 2.
    if (/^\d+\.\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      const listItemsHtml = items
        .map(item => `<li class="presentation-list-item">${parseInline(item)}</li>`)
        .join('');
      htmlParts.push(`<ol class="presentation-list">${listItemsHtml}</ol>`);
      continue;
    }

    // Regular paragraph: gather consecutive non-empty lines
    const paragraphLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^[\*\-\+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/) &&
      !/^(?:---|\*\*\*|___)\s*$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i].trim());
      i++;
    }

    if (paragraphLines.length > 0) {
      htmlParts.push(`<p class="presentation-paragraph">${parseInline(paragraphLines.join(' '))}</p>`);
    }
  }

  return htmlParts.join('\n');
}

// Module cache for fetched markdown and rendered presentation column
let cachedMarkdown = null;
let cachedColumnElement = null;
let fetchAttempted = false;

/**
 * Fetches the sprint notes markdown file.
 * Returns null silently on any error or missing file with zero console errors.
 * @param {string} [notesUrl='notes/sprint.md']
 * @returns {Promise<string|null>}
 */
export async function fetchSprintNotes(notesUrl = 'notes/sprint.md') {
  try {
    const res = await fetch(notesUrl);
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    if (!text || !text.trim()) {
      return null;
    }
    return text;
  } catch {
    // Silent fallback: never throw or log errors to console
    return null;
  }
}

/**
 * Creates the DOM element for the presentation column.
 * @param {string} parsedHtml 
 * @returns {HTMLElement}
 */
export function buildPresentationColumnElement(parsedHtml) {
  const column = document.createElement('div');
  column.className = 'presentation-column';
  column.id = 'presentationNotesColumn';
  column.setAttribute('data-section', 'Sprint Notes');

  const heroTitle = document.createElement('div');
  heroTitle.className = 'section-hero-title presentation-hero-title';
  heroTitle.textContent = 'Sprint Notes';
  column.appendChild(heroTitle);

  const card = document.createElement('div');
  card.className = 'presentation-card';
  card.innerHTML = parsedHtml;
  column.appendChild(card);

  return column;
}

/**
 * Attaches the presentation notes column to the canvas.
 * If notes/sprint.md does not exist, silently hides/removes the column with zero console errors.
 * Caches the parsed column across snapshot switches to avoid redundant network requests.
 * @param {HTMLElement} [canvasElement]
 * @param {string} [notesUrl='notes/sprint.md']
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<boolean>} Whether the column was attached
 */
export async function attachPresentationNotes(canvasElement, notesUrl = 'notes/sprint.md', forceRefresh = false) {
  const canvas = canvasElement || document.getElementById('canvas');
  if (!canvas) return false;

  // If already attached, check if still in canvas
  const existingCol = document.getElementById('presentationNotesColumn');

  if (!forceRefresh && cachedColumnElement) {
    if (!canvas.contains(cachedColumnElement)) {
      canvas.appendChild(cachedColumnElement);
    }
    return true;
  }

  if (fetchAttempted && !forceRefresh && cachedMarkdown === null) {
    if (existingCol) existingCol.remove();
    return false;
  }

  fetchAttempted = true;
  const markdown = await fetchSprintNotes(notesUrl);
  if (!markdown) {
    cachedMarkdown = null;
    cachedColumnElement = null;
    if (existingCol) existingCol.remove();
    return false;
  }

  cachedMarkdown = markdown;
  const parsedHtml = parseMarkdown(markdown);
  cachedColumnElement = buildPresentationColumnElement(parsedHtml);

  if (existingCol && existingCol !== cachedColumnElement) {
    existingCol.remove();
  }

  canvas.appendChild(cachedColumnElement);
  return true;
}

/**
 * Clears the presentation notes cache (useful for testing or manual refreshes).
 */
export function clearPresentationNotesCache() {
  cachedMarkdown = null;
  cachedColumnElement = null;
  fetchAttempted = false;
}
