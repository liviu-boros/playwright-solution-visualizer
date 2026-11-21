'use strict';

const fs = require('fs');
const { scanJsTs, stripCommentsSafe, maskStringLiterals } = require('./lexer');
const { findMatchingDelimiter, advanceBalancedGroup, splitTopLevelCommas } = require('./token-utils');

/** @type {Set<string>} */
const PLAYWRIGHT_TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);

/**
 * Checks whether an argument token slice represents a callback function (`=>` or leading `[async] function`).
 * @param {Array<object>} argTokens
 * @returns {boolean}
 */
function isCallbackArgument(argTokens) {
  if (!argTokens || argTokens.length === 0) return false;
  let i = 0;
  if (argTokens[0].type === 'ident' && argTokens[0].value === 'async') {
    i = 1;
  }
  if (argTokens[i] && argTokens[i].type === 'ident' && argTokens[i].value === 'function') {
    return true;
  }
  for (let k = i; k < argTokens.length; k++) {
    const t = argTokens[k];
    if (t.type === 'punct') {
      if (t.value === '(' || t.value === '{' || t.value === '${' || t.value === '[') {
        k = advanceBalancedGroup(argTokens, k) - 1;
        continue;
      }
      if (t.value === '=>') return true;
    }
  }
  return false;
}

/**
 * Checks whether an argument token slice represents a single template literal containing `${...}` interpolation.
 * @param {Array<object>} argTokens
 * @returns {boolean}
 */
function isInterpolatedTemplateLiteral(argTokens) {
  if (!argTokens || argTokens.length < 2) return false;
  if (argTokens[0].type !== 'template_start' || argTokens[argTokens.length - 1].type !== 'template_end') {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < argTokens.length; i++) {
    const tok = argTokens[i];
    if (tok.type === 'template_start') {
      depth++;
    } else if (tok.type === 'template_end') {
      depth--;
      if (depth < 0) return false;
      if (depth === 0 && i < argTokens.length - 1) return false;
    }
  }
  return depth === 0;
}

/**
 * Extracts a Playwright test title from a first-argument token slice (string, plain template, or interpolated template).
 * @param {Array<object>} firstArg
 * @param {string} [content='']
 * @returns {string|null}
 */
function extractTestTitle(firstArg, content = '') {
  if (!firstArg || firstArg.length === 0) return null;

  if (firstArg.length === 1 && (firstArg[0].type === 'string' || firstArg[0].type === 'template_full')) {
    return firstArg[0].value.trim();
  }

  if (isInterpolatedTemplateLiteral(firstArg)) {
    const first = firstArg[0];
    const last = firstArg[firstArg.length - 1];
    let raw = '';
    if (typeof content === 'string' && content.length > 0 && typeof first.start === 'number' && typeof last.end === 'number') {
      raw = content.slice(first.start, last.end);
    } else {
      raw = firstArg.map(tok => (tok.raw !== undefined ? tok.raw : tok.value)).join('');
    }
    const startOffset = raw.startsWith('`') ? 1 : 0;
    const endOffset = raw.endsWith('`') ? raw.length - 1 : raw.length;
    return raw.slice(startOffset, endOffset).trim();
  }

  return null;
}

/**
 * Extracts Playwright test declarations while ignoring `test.skip`/`fixme`/`fail`/`slow` annotation calls without callbacks.
 * @param {Array<object>} tokens
 * @param {string} [content='']
 * @returns {Array<{ name: string }>}
 */
function extractPlaywrightTests(tokens, content = '') {
  const items = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ident' || t.value !== 'test') continue;

    const prev = tokens[i - 1];
    if (prev && prev.type === 'punct' && (prev.value === '.' || prev.value === '?.')) continue;

    let callParenIdx = i + 1;
    if (tokens[callParenIdx] && tokens[callParenIdx].type === 'punct' && tokens[callParenIdx].value === '.') {
      const modTok = tokens[callParenIdx + 1];
      if (!modTok || modTok.type !== 'ident' || !PLAYWRIGHT_TEST_MODIFIERS.has(modTok.value)) {
        continue;
      }
      callParenIdx += 2;
    }

    if (!tokens[callParenIdx] || tokens[callParenIdx].type !== 'punct' || tokens[callParenIdx].value !== '(') {
      continue;
    }

    const closeParenIdx = findMatchingDelimiter(tokens, callParenIdx, '(', ')');
    if (closeParenIdx === -1) continue;

    const args = splitTopLevelCommas(tokens, callParenIdx + 1, closeParenIdx);
    if (args.length < 2) continue;

    const title = extractTestTitle(args[0], content);
    if (title === null) continue;

    const hasCallback = args.slice(1).some(isCallbackArgument);
    if (!hasCallback) continue;

    items.push({ name: title });
  }

  return items;
}

/**
 * Locates the class body opening brace outside of generic `<...>` constraints on literal-masked comment-stripped source.
 * @param {string} src
 * @param {number} startIndex
 * @returns {number}
 */
function findClassBodyStart(src, startIndex) {
  let inAngle = 0;
  for (let i = startIndex; i < src.length; i++) {
    const char = src[i];
    if (char === '<') {
      inAngle++;
    } else if (char === '>') {
      inAngle = Math.max(0, inAngle - 1);
    } else if (char === '{' && inAngle === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Parses a method header signature and pushes a normalized method descriptor to `methods`.
 * @param {string} header
 * @param {Array<{ name: string }>} methods
 */
function parseAndPushMethod(header, methods) {
  const cleanHeader = header.replace(/\s+/g, ' ').trim();
  if (!cleanHeader) return;

  if (/\bconstructor\s*\(/.test(cleanHeader)) return;
  if (/\b(if|for|while|switch|catch)\s*\(/.test(cleanHeader)) return;

  if (cleanHeader.includes('=>')) {
    const arrowMatch = cleanHeader.match(
      /^\s*(?:(?:public|private|protected|readonly|static|override)\s+)*(\w+)\s*(?::\s*(?:=>|[^=])+)?\s*=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)/
    );
    if (arrowMatch) {
      const isAsync = /\b(async\s*\(|async\s*<|async\s*[a-zA-Z_$]|=(\s*)async\b)/.test(cleanHeader);
      const methodName = arrowMatch[1];

      if (!['constructor', 'if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'async'].includes(methodName)) {
        methods.push({ name: isAsync ? `async ${methodName}()` : `${methodName}()` });
        return;
      }
    }
  }

  const match = cleanHeader.match(
    /^\s*(?:(async)\s+)?(?:(?:public|private|protected|static|abstract|override|get|set)\s+)*(?:(async)\s+)?(?:\*\s*)?(\w+)\s*(?:<[^>]*>)?\s*\(/
  );
  if (match) {
    const isAsync = Boolean(match[1] || match[2]);
    const methodName = match[3];

    if (!['constructor', 'if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'async'].includes(methodName)) {
      const displayName = isAsync ? `async ${methodName}()` : `${methodName}()`;
      methods.push({ name: displayName });
    }
  }
}

/**
 * Extracts depth-0 class methods from literal-masked comment-free class body text.
 * @param {string} classBody
 * @returns {Array<{ name: string }>}
 */
function extractClassMethods(classBody) {
  const methods = [];
  let depth = 0;
  let parenDepth = 0;
  let inAngle = 0;
  let typeBraceDepth = 0;
  let hasAssignment = false;
  let currentHeader = '';

  for (let i = 0; i < classBody.length; i++) {
    const char = classBody[i];

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (char === '<') {
      inAngle++;
    } else if (char === '>') {
      inAngle = Math.max(0, inAngle - 1);
    }

    if (depth === 0 && parenDepth === 0 && inAngle === 0 && typeBraceDepth === 0 && char === '=') {
      hasAssignment = true;
    }

    if (char === '{') {
      if (inAngle > 0 || (depth === 0 && hasAssignment && !currentHeader.includes('=>'))) {
        typeBraceDepth++;
        currentHeader += char;
      } else {
        if (depth === 0) {
          parseAndPushMethod(currentHeader, methods);
          currentHeader = '';
          hasAssignment = false;
        }
        depth++;
      }
    } else if (char === '}') {
      if (typeBraceDepth > 0) {
        typeBraceDepth--;
        currentHeader += char;
      } else {
        depth--;
        if (depth === 0) {
          currentHeader = '';
          hasAssignment = false;
        }
      }
    } else if (depth === 0) {
      if (char === ';') {
        if (inAngle > 0 || typeBraceDepth > 0) {
          currentHeader += char;
        } else {
          if (/\babstract\s+/.test(currentHeader) || currentHeader.includes('=>')) {
            parseAndPushMethod(currentHeader, methods);
          }
          currentHeader = '';
          hasAssignment = false;
        }
      } else if (char === '\n' && parenDepth === 0 && inAngle === 0 && typeBraceDepth === 0 && hasAssignment && !currentHeader.includes('=>')) {
        currentHeader = '';
        hasAssignment = false;
      } else {
        currentHeader += char;
      }
    }
  }

  return methods;
}

/**
 * Extracts tests, exported functions, or exported classes and methods from source code.
 * @param {string} filePathOrContent
 * @param {'test'|'functions'|'class'} type
 * @param {string|null} [optionalContent=null]
 * @returns {Array<object>}
 */
function parseContent(filePathOrContent, type, optionalContent = null) {
  let content = '';
  if (typeof optionalContent === 'string') {
    content = optionalContent;
  } else if (typeof filePathOrContent === 'string') {
    if (!filePathOrContent.includes('\n') && fs.existsSync(filePathOrContent)) {
      try {
        content = fs.statSync(filePathOrContent).isFile()
          ? fs.readFileSync(filePathOrContent, 'utf8')
          : filePathOrContent;
      } catch (_) {
        content = filePathOrContent;
      }
    } else {
      content = filePathOrContent;
    }
  }

  if (type === 'test') {
    const { tokens } = scanJsTs(content, { collectTokens: true, collectSpans: false });
    return extractPlaywrightTests(tokens, content);
  }

  const sanitizedContent = stripCommentsSafe(content);
  const literalSafeContent = maskStringLiterals(sanitizedContent);
  const items = [];

  if (type === 'functions') {
    const funcRegex = /(?:export\s+(?:default\s+)?(?:async\s+)?function(?:\s*\*\s*|\s+)(\w+)|export\s+(?:const|let)\s+(\w+)(?:\s*:\s*(?:=>|[^=])+)?\s*=\s*(?:async\s*)?(?:<[^>]*>\s*)?(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)(?:\s*:\s*[\w<>\[\]\s|&,()]+)?\s*=>)/g;
    let match;
    while ((match = funcRegex.exec(literalSafeContent)) !== null) {
      const name = match[1] || match[2];
      if (name) {
        items.push({ name });
      }
    }
  } else if (type === 'class') {
    const classHeaderRegex = /export\s+(?:(?:default|abstract)\s+)*class\s+(\w+)/g;
    let classHeaderMatch;
    while ((classHeaderMatch = classHeaderRegex.exec(literalSafeContent)) !== null) {
      const className = classHeaderMatch[1];
      const bodyStart = findClassBodyStart(literalSafeContent, classHeaderMatch.index + classHeaderMatch[0].length);
      if (bodyStart !== -1) {
        let braceCount = 1;
        let bodyEnd = bodyStart + 1;
        while (bodyEnd < literalSafeContent.length && braceCount > 0) {
          const char = literalSafeContent[bodyEnd];
          if (char === '{') braceCount++;
          else if (char === '}') braceCount--;
          bodyEnd++;
        }

        const classBody = literalSafeContent.slice(bodyStart + 1, bodyEnd - 1);
        const methods = extractClassMethods(classBody);
        items.push({
          name: className,
          methods
        });
      }
    }
  }

  return items;
}

module.exports = {
  isCallbackArgument,
  isInterpolatedTemplateLiteral,
  extractTestTitle,
  extractPlaywrightTests,
  findClassBodyStart,
  parseAndPushMethod,
  extractClassMethods,
  parseContent
};
