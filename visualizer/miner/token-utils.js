'use strict';

/** @type {Set<string>} */
const DECLARATION_KEYWORDS = new Set(['const', 'let', 'var']);

/** @type {Set<string>} */
const NON_TERMINATING_PREV_IDENTS = new Set([
  'const', 'let', 'var', 'await', 'return', 'throw', 'new', 'typeof', 'void',
  'delete', 'yield', 'as', 'satisfies', 'in', 'instanceof', 'of', 'extends',
  'implements', 'is', 'keyof', 'async', 'function', 'class', 'import', 'export',
  'type', 'interface', 'declare', 'abstract', 'enum', 'case', 'default'
]);

/** @type {Set<string>} */
const NON_BREAKING_NEXT_PUNCTS = new Set([
  '.', '?.', '(', '[', ':', '=>', '=', ',', '?', '&&', '||', '??',
  '+', '-', '*', '/', '%', '**', '==', '===', '!=', '!==', '<', '<=', '>', '>=',
  '&', '|', '^'
]);

/** @type {Set<string>} */
const NON_BREAKING_NEXT_IDENTS = new Set(['as', 'satisfies', 'instanceof', 'in', 'of']);

/**
 * Finds index of matching closing delimiter `closeVal` for an opening delimiter at `openIdx`.
 * @param {Array<object>} tokens
 * @param {number} openIdx
 * @param {string} openVal
 * @param {string} closeVal
 * @returns {number} Closing token index or -1
 */
function findMatchingDelimiter(tokens, openIdx, openVal, closeVal) {
  let depth = 0;
  for (let i = openIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct') {
      if (t.value === openVal) {
        depth++;
      } else if (t.value === closeVal) {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * Skips a `< ... >` generic type argument or parameter clause starting at `startIdx`.
 * @param {Array<object>} tokens
 * @param {number} startIdx
 * @returns {number} Index after closing `>`, or `startIdx` if unbalanced
 */
function skipAngleBrackets(tokens, startIdx) {
  if (!tokens[startIdx] || tokens[startIdx].type !== 'punct' || tokens[startIdx].value !== '<') {
    return startIdx;
  }
  let angleDepth = 0;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;

  for (let i = startIdx; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'punct') continue;
    if (t.value === '(') parenDepth++;
    else if (t.value === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (t.value === '{') braceDepth++;
    else if (t.value === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (t.value === '[') bracketDepth++;
    else if (t.value === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
      if (t.value === '<') angleDepth++;
      else if (t.value === '>') {
        angleDepth--;
        if (angleDepth === 0) return i + 1;
      } else if (t.value === ';') {
        return startIdx;
      }
    }
  }
  return startIdx;
}

/**
 * Advances over any nested balanced `( )`, `{ }`, or `[ ]` group starting at `idx`.
 * @param {Array<object>} tokens
 * @param {number} idx
 * @returns {number} Next index after the balanced group, or `idx` if not an opener
 */
function advanceBalancedGroup(tokens, idx) {
  const t = tokens[idx];
  if (!t || t.type !== 'punct') return idx;
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const close = pairs[t.value];
  if (!close) return idx;
  const closeIdx = findMatchingDelimiter(tokens, idx, t.value, close);
  return closeIdx !== -1 ? closeIdx + 1 : tokens.length;
}

/**
 * Splits a token slice cleanly by top-level commas outside balanced delimiter groups.
 * @param {Array<object>} tokens
 * @param {number} [start=0]
 * @param {number} [end=tokens.length]
 * @returns {Array<Array<object>>}
 */
function splitTopLevelCommas(tokens, start = 0, end = tokens.length) {
  const items = [];
  let curStart = start;
  let i = start;

  while (i < end) {
    const t = tokens[i];
    if (t.type === 'punct' && (t.value === '(' || t.value === '{' || t.value === '[')) {
      i = advanceBalancedGroup(tokens, i);
      continue;
    }
    if (t.type === 'punct' && t.value === ',') {
      if (i > curStart) {
        items.push(tokens.slice(curStart, i));
      }
      curStart = i + 1;
    }
    i++;
  }

  if (curStart < end) {
    items.push(tokens.slice(curStart, end));
  }
  return items;
}

/**
 * Splits tokens into statements separated by top-level `;` delimiters.
 * @param {Array<object>} tokens
 * @returns {Array<Array<object>>}
 */
function splitTopLevelStatements(tokens) {
  const statements = [];
  let cur = [];
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'punct' && (t.value === '(' || t.value === '{' || t.value === '[')) {
      const next = advanceBalancedGroup(tokens, i);
      for (let k = i; k < next; k++) cur.push(tokens[k]);
      i = next;
      continue;
    }
    if (t.type === 'punct' && t.value === ';') {
      if (cur.length > 0) statements.push(cur);
      cur = [];
      i++;
      continue;
    }
    cur.push(t);
    i++;
  }
  if (cur.length > 0) statements.push(cur);
  return statements;
}

/**
 * Strips leading `await`, outer wrapping parentheses, non-null assertions `!`, and trailing `as`/`satisfies` casts.
 * @param {Array<object>} exprTokens
 * @returns {Array<object>}
 */
function unwrapExpression(exprTokens) {
  let toks = exprTokens;
  let changed = true;

  while (changed && toks.length > 0) {
    changed = false;
    while (toks.length > 0 && toks[0].type === 'ident' && toks[0].value === 'await') {
      toks = toks.slice(1);
      changed = true;
    }
    if (toks.length >= 2 && toks[0].type === 'punct' && toks[0].value === '(') {
      const closeIdx = findMatchingDelimiter(toks, 0, '(', ')');
      if (closeIdx === toks.length - 1) {
        toks = toks.slice(1, toks.length - 1);
        changed = true;
        continue;
      }
    }
    let depth = 0;
    for (let i = 1; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'punct') {
        if (t.value === '(' || t.value === '{' || t.value === '[') depth++;
        else if (t.value === ')' || t.value === '}' || t.value === ']') depth = Math.max(0, depth - 1);
      } else if (depth === 0 && t.type === 'ident' && (t.value === 'as' || t.value === 'satisfies')) {
        toks = toks.slice(0, i);
        changed = true;
        break;
      }
    }
    if (toks.length > 0 && toks[toks.length - 1].type === 'punct' && toks[toks.length - 1].value === '!') {
      toks = toks.slice(0, -1);
      changed = true;
    }
  }

  return toks;
}

/**
 * Finds the top-level assignment `=` token index (ignoring `: Type` and `=>`).
 * @param {Array<object>} tokens
 * @param {number} [startIdx=0]
 * @returns {number}
 */
function findTopLevelEquals(tokens, startIdx = 0) {
  let i = startIdx;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'punct') {
      if (t.value === '(' || t.value === '{' || t.value === '[') {
        i = advanceBalancedGroup(tokens, i);
        continue;
      }
      if (t.value === '=') {
        return i;
      }
    }
    i++;
  }
  return -1;
}

/**
 * Checks whether a token slice is a function or arrow expression and extracts parameter and body tokens.
 * @param {Array<object>} rawTokens
 * @returns {{ paramsTokens: Array<object>, bodyTokens: Array<object>, isConcise: boolean }|null}
 */
function parseFunctionExpression(rawTokens) {
  let idx = 0;
  if (rawTokens[idx] && rawTokens[idx].type === 'ident' && rawTokens[idx].value === 'async') {
    idx++;
  }

  if (rawTokens[idx] && rawTokens[idx].type === 'ident' && rawTokens[idx].value === 'function') {
    idx++;
    if (rawTokens[idx] && rawTokens[idx].type === 'ident') idx++;
    if (rawTokens[idx] && rawTokens[idx].type === 'punct' && rawTokens[idx].value === '<') {
      idx = skipAngleBrackets(rawTokens, idx);
    }
    if (!rawTokens[idx] || rawTokens[idx].type !== 'punct' || rawTokens[idx].value !== '(') return null;
    const parenClose = findMatchingDelimiter(rawTokens, idx, '(', ')');
    if (parenClose === -1) return null;
    const paramsTokens = rawTokens.slice(idx + 1, parenClose);
    let bIdx = parenClose + 1;
    while (bIdx < rawTokens.length && !(rawTokens[bIdx].type === 'punct' && rawTokens[bIdx].value === '{')) {
      bIdx++;
    }
    if (bIdx >= rawTokens.length) return null;
    const bodyClose = findMatchingDelimiter(rawTokens, bIdx, '{', '}');
    if (bodyClose === -1) return null;
    return {
      paramsTokens,
      bodyTokens: rawTokens.slice(bIdx + 1, bodyClose),
      isConcise: false
    };
  }

  if (rawTokens[idx] && rawTokens[idx].type === 'punct' && rawTokens[idx].value === '<') {
    idx = skipAngleBrackets(rawTokens, idx);
  }

  let paramsTokens = [];
  let afterParamsIdx = idx;

  if (rawTokens[idx] && rawTokens[idx].type === 'punct' && rawTokens[idx].value === '(') {
    const parenClose = findMatchingDelimiter(rawTokens, idx, '(', ')');
    if (parenClose === -1) return null;
    paramsTokens = rawTokens.slice(idx + 1, parenClose);
    afterParamsIdx = parenClose + 1;
  } else if (rawTokens[idx] && rawTokens[idx].type === 'ident') {
    paramsTokens = [rawTokens[idx]];
    afterParamsIdx = idx + 1;
  } else {
    return null;
  }

  let scanIdx = afterParamsIdx;
  if (rawTokens[scanIdx] && rawTokens[scanIdx].type === 'punct' && rawTokens[scanIdx].value === ':') {
    scanIdx++;
    while (scanIdx < rawTokens.length) {
      const t = rawTokens[scanIdx];
      if (t.type === 'punct') {
        if (t.value === '(' || t.value === '{' || t.value === '[') {
          scanIdx = advanceBalancedGroup(rawTokens, scanIdx);
          continue;
        }
        if (t.value === '=>') break;
      }
      scanIdx++;
    }
  }

  if (!rawTokens[scanIdx] || rawTokens[scanIdx].type !== 'punct' || rawTokens[scanIdx].value !== '=>') {
    return null;
  }

  const afterArrow = scanIdx + 1;
  if (rawTokens[afterArrow] && rawTokens[afterArrow].type === 'punct' && rawTokens[afterArrow].value === '{') {
    const bodyClose = findMatchingDelimiter(rawTokens, afterArrow, '{', '}');
    if (bodyClose === -1) return null;
    return {
      paramsTokens,
      bodyTokens: rawTokens.slice(afterArrow + 1, bodyClose),
      isConcise: false
    };
  }

  return {
    paramsTokens,
    bodyTokens: rawTokens.slice(afterArrow),
    isConcise: true
  };
}

/**
 * Recursively gathers nested assignments, function calls, and `return` statements inside control blocks.
 * @param {Array<object>} tokens
 * @param {Map<string, Array<object>>} vars
 * @param {Array<{ callee: string, args: Array<Array<object>> }>} calls
 * @param {Array<Array<object>>} returns
 */
function scanInnerStatements(tokens, vars, calls, returns) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'ident' && t.value === 'return') {
      let j = i + 1;
      while (j < tokens.length && !(tokens[j].type === 'punct' && (tokens[j].value === ';' || tokens[j].value === '}'))) {
        if (tokens[j].type === 'punct' && (tokens[j].value === '(' || tokens[j].value === '{' || tokens[j].value === '[')) {
          j = advanceBalancedGroup(tokens, j);
          continue;
        }
        j++;
      }
      if (j > i + 1) returns.push(tokens.slice(i + 1, j));
      continue;
    }

    if (t.type === 'ident' && tokens[i + 1] && tokens[i + 1].type === 'punct' && tokens[i + 1].value === '(') {
      const prev = tokens[i - 1];
      if (!prev || !(prev.type === 'punct' && (prev.value === '.' || prev.value === 'new'))) {
        const closeParen = findMatchingDelimiter(tokens, i + 1, '(', ')');
        if (closeParen !== -1) {
          const argTokens = tokens.slice(i + 2, closeParen);
          calls.push({ callee: t.value, args: splitTopLevelCommas(argTokens) });
        }
      }
    }

    if (t.type === 'ident' && tokens[i + 1] && tokens[i + 1].type === 'punct' && tokens[i + 1].value === '=') {
      const prev = tokens[i - 1];
      if (!prev || !(prev.type === 'punct' && prev.value === '.')) {
        let j = i + 2;
        while (j < tokens.length && !(tokens[j].type === 'punct' && (tokens[j].value === ';' || tokens[j].value === '}'))) {
          if (tokens[j].type === 'punct' && (tokens[j].value === '(' || tokens[j].value === '{' || tokens[j].value === '[')) {
            j = advanceBalancedGroup(tokens, j);
            continue;
          }
          j++;
        }
        if (j > i + 2 && (!vars.has(t.value) || tokens[i + 2]?.value === '{')) {
          vars.set(t.value, tokens.slice(i + 2, j));
        }
      }
    }
  }
}

/**
 * Reads statements inside a function block to collect variable bindings, function definitions, calls, and returns.
 * @param {Array<object>} bodyTokens
 * @returns {{ vars: Map<string, Array<object>>, fns: Map<string, object>, calls: Array<{ callee: string, args: Array<Array<object>> }>, returns: Array<Array<object>> }}
 */
function analyzeBlockBody(bodyTokens) {
  const vars = new Map();
  const fns = new Map();
  const calls = [];
  const returns = [];

  const statements = splitTopLevelStatements(bodyTokens);
  for (const stmt of statements) {
    if (stmt.length === 0) continue;

    let fnStart = 0;
    if (stmt[0].type === 'ident' && stmt[0].value === 'async') fnStart = 1;
    if (stmt[fnStart] && stmt[fnStart].type === 'ident' && stmt[fnStart].value === 'function' && stmt[fnStart + 1] && stmt[fnStart + 1].type === 'ident') {
      const fnName = stmt[fnStart + 1].value;
      const fnExpr = parseFunctionExpression(stmt);
      if (fnExpr) {
        fns.set(fnName, fnExpr);
        continue;
      }
    }

    if (stmt[0].type === 'ident' && DECLARATION_KEYWORDS.has(stmt[0].value)) {
      const declParts = splitTopLevelCommas(stmt, 1, stmt.length);
      for (const decl of declParts) {
        if (decl[0] && decl[0].type === 'ident') {
          const varName = decl[0].value;
          const eqIdx = findTopLevelEquals(decl, 1);
          if (eqIdx !== -1 && eqIdx + 1 < decl.length) {
            const rhs = decl.slice(eqIdx + 1);
            vars.set(varName, rhs);
            const maybeFn = parseFunctionExpression(rhs);
            if (maybeFn) fns.set(varName, maybeFn);
          }
        }
      }
    }

    if (stmt[0].type === 'ident' && stmt[1] && stmt[1].type === 'punct' && stmt[1].value === '=') {
      const varName = stmt[0].value;
      const rhs = stmt.slice(2);
      vars.set(varName, rhs);
      const maybeFn = parseFunctionExpression(rhs);
      if (maybeFn) fns.set(varName, maybeFn);
    }

    if (stmt[0].type === 'ident' && stmt[0].value === 'return' && stmt.length > 1) {
      returns.push(stmt.slice(1));
    }

    scanInnerStatements(stmt, vars, calls, returns);
  }

  return { vars, fns, calls, returns };
}

/**
 * Extracts key/value entries, getters, shorthands, spreads, and methods from tokens inside an object literal `{ ... }`.
 * @param {Array<object>} objTokens
 * @returns {Array<object>}
 */
function parseObjectLiteralProperties(objTokens) {
  const entries = [];
  const rawProps = splitTopLevelCommas(objTokens);

  for (const prop of rawProps) {
    if (prop.length === 0) continue;

    if (prop[0].type === 'punct' && prop[0].value === '...') {
      entries.push({ kind: 'spread', valueTokens: prop.slice(1) });
      continue;
    }

    if (prop[0].type === 'ident' && prop[0].value === 'get' && prop[1] && (prop[1].type === 'ident' || prop[1].type === 'string')) {
      const propName = prop[1].value;
      const fnExpr = parseFunctionExpression([{ type: 'ident', value: 'function' }, ...prop.slice(2)]);
      if (fnExpr) {
        entries.push({ kind: 'getter', name: propName, fnExpr });
        continue;
      }
    }

    let nameIdx = 0;
    let isAsyncMethod = false;
    if (prop[0].type === 'ident' && prop[0].value === 'async' && prop[1] && (prop[1].type === 'ident' || prop[1].type === 'string') && prop[2] && prop[2].type === 'punct' && (prop[2].value === '(' || prop[2].value === '<')) {
      isAsyncMethod = true;
      nameIdx = 1;
    }

    const nameTok = prop[nameIdx];
    if (!nameTok || (nameTok.type !== 'ident' && nameTok.type !== 'string')) continue;
    const propName = nameTok.value;
    const nextTok = prop[nameIdx + 1];

    if (nextTok && nextTok.type === 'punct' && nextTok.value === ':') {
      entries.push({ kind: 'pair', name: propName, valueTokens: prop.slice(nameIdx + 2) });
    } else if (nextTok && nextTok.type === 'punct' && (nextTok.value === '(' || nextTok.value === '<')) {
      const prefix = isAsyncMethod
        ? [{ type: 'ident', value: 'async' }, { type: 'ident', value: 'function' }]
        : [{ type: 'ident', value: 'function' }];
      const fnExpr = parseFunctionExpression([...prefix, ...prop.slice(nameIdx + 1)]);
      if (fnExpr) {
        entries.push({ kind: 'method', name: propName, fnExpr });
      }
    } else if (prop.length === 1 && nameTok.type === 'ident') {
      entries.push({ kind: 'shorthand', name: propName, valueTokens: [nameTok] });
    }
  }

  return entries;
}

/**
 * Checks whether an ASI statement boundary occurs between `prevTok` and `curTok` across a newline.
 * @param {object} prevTok
 * @param {object} curTok
 * @returns {boolean}
 */
function isAsiStatementBreak(prevTok, curTok) {
  if (!prevTok || !curTok || !prevTok.line || !curTok.line || curTok.line <= prevTok.line) {
    return false;
  }

  let prevCanEnd = false;
  if (prevTok.type === 'ident') {
    prevCanEnd = !NON_TERMINATING_PREV_IDENTS.has(prevTok.value);
  } else if (
    prevTok.type === 'string' ||
    prevTok.type === 'template_full' ||
    prevTok.type === 'template_end' ||
    prevTok.type === 'number' ||
    prevTok.type === 'regex'
  ) {
    prevCanEnd = true;
  } else if (prevTok.type === 'punct') {
    prevCanEnd = prevTok.value === ')' || prevTok.value === ']' || prevTok.value === '}' || prevTok.value === '!' || prevTok.value === '++' || prevTok.value === '--';
  }

  if (!prevCanEnd) return false;

  if (curTok.type === 'punct' && NON_BREAKING_NEXT_PUNCTS.has(curTok.value)) {
    return false;
  }
  if (curTok.type === 'ident' && NON_BREAKING_NEXT_IDENTS.has(curTok.value)) {
    return false;
  }

  return true;
}

/**
 * Extracts function declarations (`function f(...)`) and variable-bound function/arrow definitions (`const f = ...`).
 * @param {Array<object>} tokens
 * @returns {Map<string, { paramsTokens: Array<object>, bodyTokens: Array<object>, startIdx: number }>}
 */
function collectFunctionDefs(tokens) {
  const fns = new Map();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct') {
      continue;
    }

    if (t.type === 'ident' && t.value === 'function' && tokens[i + 1] && tokens[i + 1].type === 'ident') {
      const fnName = tokens[i + 1].value;
      const start = (tokens[i - 1] && tokens[i - 1].type === 'ident' && tokens[i - 1].value === 'async') ? i - 1 : i;
      let j = i + 2;
      if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '<') j = skipAngleBrackets(tokens, j);
      if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '(') {
        const parenClose = findMatchingDelimiter(tokens, j, '(', ')');
        if (parenClose !== -1) {
          let bIdx = parenClose + 1;
          while (bIdx < tokens.length && !(tokens[bIdx].type === 'punct' && tokens[bIdx].value === '{')) bIdx++;
          if (bIdx < tokens.length) {
            const bodyClose = findMatchingDelimiter(tokens, bIdx, '{', '}');
            if (bodyClose !== -1) {
              fns.set(fnName, {
                paramsTokens: tokens.slice(j + 1, parenClose),
                bodyTokens: tokens.slice(bIdx + 1, bodyClose),
                startIdx: start
              });
            }
          }
        }
      }
      continue;
    }

    if (t.type === 'ident' && DECLARATION_KEYWORDS.has(t.value) && tokens[i + 1] && tokens[i + 1].type === 'ident') {
      const varName = tokens[i + 1].value;
      const eqIdx = findTopLevelEquals(tokens, i + 2);
      if (eqIdx !== -1) {
        let endIdx = eqIdx + 1;
        while (endIdx < tokens.length && !(tokens[endIdx].type === 'punct' && tokens[endIdx].value === ';')) {
          if (endIdx > eqIdx + 1 && isAsiStatementBreak(tokens[endIdx - 1], tokens[endIdx])) {
            break;
          }
          if (tokens[endIdx].type === 'punct' && (tokens[endIdx].value === '(' || tokens[endIdx].value === '{' || tokens[endIdx].value === '[')) {
            const afterGroup = advanceBalancedGroup(tokens, endIdx);
            const wasBlock = tokens[endIdx].value === '{';
            endIdx = afterGroup;
            if (wasBlock && (!tokens[endIdx] || (tokens[endIdx].type === 'punct' && tokens[endIdx].value === ';'))) {
              break;
            }
            continue;
          }
          if (tokens[endIdx].type === 'punct' && tokens[endIdx].value === '}') break;
          endIdx++;
        }
        const fnExpr = parseFunctionExpression(tokens.slice(eqIdx + 1, endIdx));
        if (fnExpr) {
          fns.set(varName, {
            paramsTokens: fnExpr.paramsTokens,
            bodyTokens: fnExpr.bodyTokens,
            startIdx: eqIdx + 1
          });
        }
      }
    }
  }

  return fns;
}

module.exports = {
  DECLARATION_KEYWORDS,
  findMatchingDelimiter,
  skipAngleBrackets,
  advanceBalancedGroup,
  splitTopLevelCommas,
  splitTopLevelStatements,
  unwrapExpression,
  findTopLevelEquals,
  parseFunctionExpression,
  analyzeBlockBody,
  parseObjectLiteralProperties,
  isAsiStatementBreak,
  collectFunctionDefs
};
