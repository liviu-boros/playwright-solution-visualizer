'use strict';

/** @type {Set<string>} */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'throw', 'case', 'default', 'delete', 'void', 'typeof',
  'yield', 'await', 'new', 'in', 'instanceof', 'of', 'else', 'do',
  'export', 'extends', 'import', 'async'
]);

/** @type {Set<string>} */
const REGEX_NON_PRECEDING_PUNCTS = new Set([']', '++', '--']);

/** @type {Set<string>} */
const CONTROL_PAREN_KEYWORDS = new Set(['if', 'while', 'for', 'with']);

/** @type {Array<string>} */
const MULTI_CHAR_PUNCTS = [
  '===', '!==', '...', '&&=', '||=', '??=', '?.', '=>',
  '==', '!=', '<=', '&&', '||', '??', '++', '--', '**',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<'
];

/**
 * Checks if a character can start a JS/TS identifier.
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentStart(ch) {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$';
}

/**
 * Checks if a character can continue a JS/TS identifier.
 * @param {string} ch
 * @returns {boolean}
 */
function isIdentPart(ch) {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9');
}

/**
 * Determines whether `/` at the current lexer state begins a regex literal.
 * @param {object|null} prevSigToken
 * @param {boolean} lastParenWasControl
 * @returns {boolean}
 */
function canStartRegex(prevSigToken, lastParenWasControl) {
  if (!prevSigToken) return true;
  if (prevSigToken.type === 'ident') {
    return REGEX_PRECEDING_KEYWORDS.has(prevSigToken.value);
  }
  if (prevSigToken.type === 'number' || prevSigToken.type === 'string' || prevSigToken.type === 'regex') {
    return false;
  }
  if (prevSigToken.type === 'template_end') {
    return false;
  }
  if (prevSigToken.type === 'punct') {
    if (prevSigToken.value === ')') return lastParenWasControl;
    if (prevSigToken.value === '}') return true;
    return !REGEX_NON_PRECEDING_PUNCTS.has(prevSigToken.value);
  }
  return false;
}

/**
 * Attempts to read a single-line regex literal starting at `startIdx`.
 * @param {string} src
 * @param {number} startIdx
 * @returns {number} Exclusive end index if valid regex literal, otherwise -1
 */
function tryReadRegexEnd(src, startIdx) {
  let j = startIdx + 1;
  let inCharClass = false;

  while (j < src.length) {
    const c = src[j];
    if (c === '\n' || c === '\r') {
      return -1;
    }
    if (c === '\\') {
      if (j + 1 >= src.length || src[j + 1] === '\n' || src[j + 1] === '\r') {
        return -1;
      }
      j += 2;
      continue;
    }
    if (c === '[' && !inCharClass) {
      inCharClass = true;
      j++;
      continue;
    }
    if (c === ']' && inCharClass) {
      inCharClass = false;
      j++;
      continue;
    }
    if (c === '/' && !inCharClass) {
      let end = j + 1;
      while (end < src.length && /[dgimsuvy]/i.test(src[end])) {
        end++;
      }
      return end;
    }
    j++;
  }
  return -1;
}

/**
 * Unquotes single- or double-quoted string literals while preserving common escape sequences.
 * @param {string} raw
 * @returns {string}
 */
function unquoteString(raw) {
  if (!raw || raw.length < 2) return raw || '';
  const inner = raw.slice(1, -1);
  return inner.replace(/\\(['"\\nrt])/g, (_, ch) => {
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    return ch;
  });
}

/**
 * Unquotes plain backtick template string literals.
 * @param {string} raw
 * @returns {string}
 */
function unquoteTemplate(raw) {
  if (!raw || raw.length < 2) return raw || '';
  return raw.slice(1, -1).replace(/\\([`\\$])/g, '$1');
}

/**
 * Single-pass JS/TS lexical scanner recognizing comments, strings, regexes, and template interpolations.
 * Keeps `<` and `>` separate so nested TS generics such as `>>` balance accurately without external AST dependencies.
 * @param {string} src
 * @param {object} [options={}]
 * @returns {{ tokens: Array<object>, spans: Array<object> }}
 */
function scanJsTs(src, options = {}) {
  const collectTokens = options.collectTokens !== false;
  const collectSpans = Boolean(options.collectSpans);
  const tokens = [];
  const spans = [];

  if (!src) return { tokens, spans };

  let i = 0;
  let line = 1;
  let prevSigToken = null;
  let lastParenWasControl = false;
  const parenStack = [];
  const templateStack = [];

  const pushSpan = (kind, start, end) => {
    if (collectSpans) {
      spans.push({ kind, start, end });
    }
  };

  const pushToken = (token) => {
    if (token.line === undefined) token.line = line;
    prevSigToken = token;
    if (collectTokens) {
      tokens.push(token);
    }
  };

  while (i < src.length) {
    if (templateStack.length > 0 && templateStack[templateStack.length - 1].resumeTemplate) {
      const state = templateStack[templateStack.length - 1];
      state.resumeTemplate = false;
      const partStart = i;
      const partStartLine = line;
      let hitInterpolation = false;

      while (i < src.length) {
        const ch = src[i];
        if (ch === '\\') {
          if (i + 1 < src.length && src[i + 1] === '\n') line++;
          i += (i + 1 < src.length) ? 2 : 1;
        } else if (ch === '$' && src[i + 1] === '{') {
          i += 2;
          hitInterpolation = true;
          break;
        } else if (ch === '`') {
          i++;
          break;
        } else {
          if (ch === '\n') line++;
          i++;
        }
      }

      if (hitInterpolation) {
        pushSpan('template_part', partStart, i - 2);
        if (i - 2 > partStart) {
          pushToken({
            type: 'template_middle',
            value: src.slice(partStart, i - 2),
            raw: src.slice(partStart, i - 2),
            start: partStart,
            end: i - 2,
            line: partStartLine
          });
        }
        pushToken({ type: 'punct', value: '${', raw: '${', start: i - 2, end: i, line });
        state.braceDepth = 1;
      } else {
        pushSpan('template_part', partStart, i);
        const endTok = {
          type: 'template_end',
          value: src.slice(partStart, i),
          raw: src.slice(partStart, i),
          start: partStart,
          end: i,
          line: partStartLine
        };
        templateStack.pop();
        prevSigToken = endTok;
        if (collectTokens) {
          tokens.push(endTok);
        }
      }
      continue;
    }

    const char = src[i];
    const nextChar = src[i + 1];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\v' || char === '\f') {
      if (char === '\n') line++;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      const start = i;
      i += 2;
      while (i < src.length && src[i] !== '\n') {
        i++;
      }
      pushSpan('line_comment', start, i);
      continue;
    }

    if (char === '/' && nextChar === '*') {
      const start = i;
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      if (i < src.length) {
        i += 2;
      }
      pushSpan('block_comment', start, i);
      continue;
    }

    if (char === "'" || char === '"') {
      const start = i;
      const startLine = line;
      const quote = char;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') {
          if (i + 1 < src.length && src[i + 1] === '\n') line++;
          i += (i + 1 < src.length) ? 2 : 1;
        } else if (src[i] === quote) {
          i++;
          break;
        } else {
          if (src[i] === '\n') line++;
          i++;
        }
      }
      const raw = src.slice(start, i);
      pushSpan('string', start, i);
      pushToken({ type: 'string', value: unquoteString(raw), raw, start, end: i, line: startLine });
      continue;
    }

    if (char === '`') {
      const start = i;
      const startLine = line;
      i++;
      let hitInterpolation = false;
      while (i < src.length) {
        if (src[i] === '\\') {
          if (i + 1 < src.length && src[i + 1] === '\n') line++;
          i += (i + 1 < src.length) ? 2 : 1;
        } else if (src[i] === '$' && src[i + 1] === '{') {
          i += 2;
          hitInterpolation = true;
          break;
        } else if (src[i] === '`') {
          i++;
          break;
        } else {
          if (src[i] === '\n') line++;
          i++;
        }
      }
      if (hitInterpolation) {
        pushSpan('template_part', start, i - 2);
        templateStack.push({ braceDepth: 1, resumeTemplate: false });
        pushToken({
          type: 'template_start',
          value: src.slice(start, i - 2),
          raw: src.slice(start, i - 2),
          start,
          end: i - 2,
          line: startLine
        });
        pushToken({ type: 'punct', value: '${', raw: '${', start: i - 2, end: i, line });
      } else {
        const raw = src.slice(start, i);
        pushSpan('template_part', start, i);
        pushToken({ type: 'template_full', value: unquoteTemplate(raw), raw, start, end: i, line: startLine });
      }
      continue;
    }

    if (char === '/' && canStartRegex(prevSigToken, lastParenWasControl)) {
      const regexEnd = tryReadRegexEnd(src, i);
      if (regexEnd !== -1) {
        const raw = src.slice(i, regexEnd);
        pushSpan('regex', i, regexEnd);
        pushToken({ type: 'regex', value: raw, raw, start: i, end: regexEnd, line });
        i = regexEnd;
        continue;
      }
    }

    if (templateStack.length > 0) {
      const activeTemplate = templateStack[templateStack.length - 1];
      if (char === '{') {
        activeTemplate.braceDepth++;
      } else if (char === '}') {
        activeTemplate.braceDepth--;
        if (activeTemplate.braceDepth === 0) {
          pushToken({ type: 'punct', value: '}', raw: '}', start: i, end: i + 1, line });
          activeTemplate.resumeTemplate = true;
          i++;
          continue;
        }
      }
    }

    if ((char >= '0' && char <= '9') || (char === '.' && nextChar >= '0' && nextChar <= '9')) {
      const start = i;
      if (char === '0' && (nextChar === 'x' || nextChar === 'X' || nextChar === 'b' || nextChar === 'B' || nextChar === 'o' || nextChar === 'O')) {
        i += 2;
        while (i < src.length && /[0-9a-fA-F_]/.test(src[i])) i++;
      } else {
        while (i < src.length && /[0-9_]/.test(src[i])) i++;
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
          i++;
          while (i < src.length && /[0-9_]/.test(src[i])) i++;
        }
        if (src[i] === 'e' || src[i] === 'E') {
          i++;
          if (src[i] === '+' || src[i] === '-') i++;
          while (i < src.length && /[0-9_]/.test(src[i])) i++;
        }
      }
      if (src[i] === 'n') i++;
      const raw = src.slice(start, i);
      pushToken({ type: 'number', value: raw, raw, start, end: i });
      continue;
    }

    if (isIdentStart(char)) {
      const start = i;
      i++;
      while (i < src.length && isIdentPart(src[i])) i++;
      const raw = src.slice(start, i);
      lastParenWasControl = false;
      pushToken({ type: 'ident', value: raw, raw, start, end: i });
      continue;
    }

    let matchedPunct = '';
    for (const candidate of MULTI_CHAR_PUNCTS) {
      if (src.startsWith(candidate, i)) {
        matchedPunct = candidate;
        break;
      }
    }
    if (!matchedPunct) {
      matchedPunct = char;
    }

    const start = i;
    i += matchedPunct.length;

    if (matchedPunct === '(') {
      const isControl = Boolean(prevSigToken && prevSigToken.type === 'ident' && CONTROL_PAREN_KEYWORDS.has(prevSigToken.value));
      parenStack.push(isControl);
      lastParenWasControl = false;
    } else if (matchedPunct === ')') {
      lastParenWasControl = parenStack.length > 0 ? Boolean(parenStack.pop()) : false;
    } else {
      lastParenWasControl = false;
    }

    pushToken({ type: 'punct', value: matchedPunct, raw: matchedPunct, start, end: i });
  }

  return { tokens, spans };
}

/**
 * Replaces source spans with whitespace or preserved newlines so line numbers stay aligned.
 * @param {string} src
 * @param {Array<{ start: number, end: number }>} spans
 * @param {boolean} [collapseBlockToSpace=false]
 * @returns {string}
 */
function applySpanMasks(src, spans, collapseBlockToSpace = false) {
  if (!src || spans.length === 0) return src || '';
  let out = '';
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      out += src.slice(cursor, span.start);
    }
    const slice = src.slice(span.start, span.end);
    if (collapseBlockToSpace) {
      out += slice.includes('\n') ? slice.replace(/[^\n]/g, '') : ' ';
    } else {
      out += slice.replace(/[^\n]/g, ' ');
    }
    cursor = span.end;
  }

  if (cursor < src.length) {
    out += src.slice(cursor);
  }
  return out;
}

/**
 * Strips single-line and multi-line comments outside of strings, templates, and regexes safely.
 * @param {string} src
 * @returns {string} Sanitized source code
 */
function stripCommentsSafe(src) {
  if (!src) return '';
  const { spans } = scanJsTs(src, { collectTokens: false, collectSpans: true });
  const commentSpans = spans.filter(s => s.kind === 'line_comment' || s.kind === 'block_comment');
  return applySpanMasks(src, commentSpans, true);
}

/**
 * Masks string literals, plain template text (preserving `${...}` interpolations), and regex literals with spaces.
 * @param {string} src
 * @returns {string} Source with literal contents masked
 */
function maskStringLiterals(src) {
  if (!src) return '';
  const { spans } = scanJsTs(src, { collectTokens: false, collectSpans: true });
  const maskSpans = spans.filter(s => s.kind === 'string' || s.kind === 'template_part' || s.kind === 'regex');
  return applySpanMasks(src, maskSpans, false);
}

module.exports = {
  scanJsTs,
  unquoteString,
  unquoteTemplate,
  applySpanMasks,
  stripCommentsSafe,
  maskStringLiterals
};
