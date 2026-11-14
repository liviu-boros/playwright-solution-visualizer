'use strict';

const path = require('path');
const { scanJsTs } = require('./lexer');
const {
  DECLARATION_KEYWORDS,
  findMatchingDelimiter,
  advanceBalancedGroup,
  splitTopLevelCommas,
  unwrapExpression,
  findTopLevelEquals,
  parseFunctionExpression,
  parseObjectLiteralProperties,
  isAsiStatementBreak,
  collectFunctionDefs
} = require('./token-utils');
const { isRegularFile } = require('./module-resolver');

/**
 * Evaluates an identifier lookup up the lexical scope stack or falls back to root fixture names.
 * @param {string} name
 * @param {Array<Map<string, object>>} scopeStack
 * @param {Set<string>} fixtureRoots
 * @returns {object|null}
 */
function lookupBinding(name, scopeStack, fixtureRoots) {
  for (let i = scopeStack.length - 1; i >= 0; i--) {
    if (scopeStack[i].has(name)) {
      return scopeStack[i].get(name);
    }
  }
  if (fixtureRoots.has(name)) {
    return { kind: 'path', path: name };
  }
  return null;
}

/**
 * Extends a binding value with a property access `.prop`.
 * @param {object|null} val
 * @param {string} prop
 * @returns {object|null}
 */
function accessBindingProperty(val, prop) {
  if (!val || !prop) return null;
  if (val.kind === 'path') {
    return { kind: 'path', path: `${val.path}.${prop}` };
  }
  if (val.kind === 'object' && val.props.has(prop)) {
    return val.props.get(prop);
  }
  return null;
}

/**
 * Walks a spec token stream in lexical scope to resolve literal chains, destructuring, aliases, and helper calls.
 */
class SpecChainWalker {
  /**
   * Creates a spec dependency chain walker.
   * @param {{ lookupMap: Map<string, string>, rootKeys: Set<string> }} fixtureScope
   * @param {Map<string, { absPath: string, exportName: string }>} importedHelpers
   * @param {import('./module-resolver').ModuleResolver} moduleResolver
   */
  constructor(fixtureScope, importedHelpers, moduleResolver) {
    /** @type {Map<string, string>} */
    this.lookupMap = (fixtureScope && fixtureScope.lookupMap) || new Map();
    /** @type {Set<string>} */
    this.effectiveRoots = new Set((fixtureScope && fixtureScope.rootKeys) || []);
    for (const key of this.lookupMap.keys()) {
      this.effectiveRoots.add(key.split('.')[0]);
    }
    /** @type {Map<string, { absPath: string, exportName: string }>} */
    this.importedHelpers = importedHelpers || new Map();
    /** @type {import('./module-resolver').ModuleResolver} */
    this.moduleResolver = moduleResolver;
    /** @type {Set<string>} */
    this.matchedModules = new Set();
    /** @type {Set<string>} */
    this.visitedHelperCalls = new Set();
  }

  /**
   * Resolves all fixture-backed workspace module IDs referenced in `tokens`.
   * @param {Array<object>} tokens
   * @param {string} currentFilePath
   * @returns {Array<string>}
   */
  resolve(tokens, currentFilePath) {
    if (!this.lookupMap || this.lookupMap.size === 0 || this.effectiveRoots.size === 0) {
      return [];
    }
    const fileFns = collectFunctionDefs(tokens);
    this.walkTokens(tokens, [new Map()], fileFns, currentFilePath, 0);
    return Array.from(this.matchedModules);
  }

  /**
   * Records a matched workspace module ID when a binding reaches a configured fixture leaf path.
   * @param {object|null} bindingVal
   */
  recordIfLeaf(bindingVal) {
    if (bindingVal && bindingVal.kind === 'path' && this.lookupMap.has(bindingVal.path)) {
      this.matchedModules.add(this.lookupMap.get(bindingVal.path));
    }
  }

  /**
   * Binds an identifier or nested object destructuring pattern to a binding value inside `targetScope`.
   * @param {Array<object>} patTokens
   * @param {object|null} rhsVal
   * @param {Map<string, object>} targetScope
   * @param {boolean} [requireFixtureMatch=false]
   */
  bindPattern(patTokens, rhsVal, targetScope, requireFixtureMatch = false) {
    let toks = patTokens;
    const eqIdx = findTopLevelEquals(toks, 0);
    if (eqIdx !== -1) toks = toks.slice(0, eqIdx);

    if (toks[0] && toks[0].type === 'punct' && toks[0].value === '{') {
      const closeBrace = findMatchingDelimiter(toks, 0, '{', '}');
      if (closeBrace !== -1) {
        toks = toks.slice(0, closeBrace + 1);
        const props = splitTopLevelCommas(toks, 1, toks.length - 1);
        for (const prop of props) {
          if (prop.length === 0) continue;
          if (prop[0].type === 'punct' && prop[0].value === '...') {
            if (prop[1] && prop[1].type === 'ident' && rhsVal && !requireFixtureMatch) {
              targetScope.set(prop[1].value, rhsVal);
            }
            continue;
          }
          if (prop[0].type !== 'ident' && prop[0].type !== 'string') continue;
          const propKey = prop[0].value;
          const nextVal = rhsVal
            ? accessBindingProperty(rhsVal, propKey)
            : (requireFixtureMatch && this.effectiveRoots.has(propKey) ? { kind: 'path', path: propKey } : null);

          if (!nextVal) continue;

          if (prop[1] && prop[1].type === 'punct' && prop[1].value === ':') {
            this.bindPattern(prop.slice(2), nextVal, targetScope, false);
          } else {
            this.recordIfLeaf(nextVal);
            targetScope.set(propKey, nextVal);
          }
        }
      }
      return;
    }

    if (toks[0] && toks[0].type === 'ident' && rhsVal) {
      this.recordIfLeaf(rhsVal);
      targetScope.set(toks[0].value, rhsVal);
    }
  }

  /**
   * Evaluates an expression token slice to a fixture binding value and records any leaf chains encountered.
   * @param {Array<object>} exprRaw
   * @param {Array<Map<string, object>>} scopeStack
   * @returns {object|null}
   */
  evalExpr(exprRaw, scopeStack) {
    const expr = unwrapExpression(exprRaw);
    if (expr.length === 0) return null;

    if (expr[0].type === 'punct' && expr[0].value === '{') {
      const closeIdx = findMatchingDelimiter(expr, 0, '{', '}');
      if (closeIdx !== -1 && closeIdx === expr.length - 1) {
        const objProps = new Map();
        const entries = parseObjectLiteralProperties(expr.slice(1, closeIdx));
        for (const e of entries) {
          if (e.kind === 'pair' || e.kind === 'shorthand') {
            const v = this.evalExpr(e.valueTokens, scopeStack);
            if (v) objProps.set(e.name, v);
          }
        }
        return objProps.size > 0 ? { kind: 'object', props: objProps } : null;
      }
    }

    if (expr[0].type !== 'ident') return null;
    let cur = lookupBinding(expr[0].value, scopeStack, this.effectiveRoots);
    if (!cur) return null;
    this.recordIfLeaf(cur);

    let idx = 1;
    while (idx < expr.length) {
      const t = expr[idx];
      if (t.type === 'punct' && (t.value === '.' || t.value === '?.') && expr[idx + 1] && expr[idx + 1].type === 'ident') {
        const propName = expr[idx + 1].value;
        cur = accessBindingProperty(cur, propName);
        if (!cur) return null;
        this.recordIfLeaf(cur);
        idx += 2;
      } else if (t.type === 'punct' && (t.value === '(' || t.value === '[')) {
        idx = advanceBalancedGroup(expr, idx);
      } else if (t.type === 'punct' && t.value === '!') {
        idx++;
      } else {
        break;
      }
    }

    return cur;
  }

  /**
   * Attempts to parse and walk a function or arrow expression starting at token index `i`.
   * @param {Array<object>} toks
   * @param {number} i
   * @param {Array<Map<string, object>>} scopeStack
   * @param {Map<string, object>} fnDefs
   * @param {string} currentHelperFile
   * @param {number} depth
   * @returns {number} Next token index after callback, or -1 if not a callback
   */
  tryWalkCallback(toks, i, scopeStack, fnDefs, currentHelperFile, depth) {
    const t = toks[i];
    const startsFn = (
      (t.type === 'punct' && (t.value === '(' || t.value === '<')) ||
      (t.type === 'ident' && (t.value === 'async' || t.value === 'function'))
    );
    if (!startsFn) return -1;

    let probeEnd = i;
    let sawArrow = false;
    while (probeEnd < toks.length) {
      if (probeEnd > i && sawArrow && isAsiStatementBreak(toks[probeEnd - 1], toks[probeEnd])) {
        break;
      }
      const pt = toks[probeEnd];
      if (pt.type === 'punct') {
        if (pt.value === '{' || pt.value === ';' || pt.value === ')' || pt.value === ',') {
          break;
        }
        if (pt.value === '=>') {
          sawArrow = true;
          probeEnd++;
          continue;
        }
        if (pt.value === '(' || pt.value === '[') {
          probeEnd = advanceBalancedGroup(toks, probeEnd);
          continue;
        }
      }
      probeEnd++;
    }

    let fnExpr = null;
    let nextIdx = -1;

    if (toks[probeEnd] && toks[probeEnd].type === 'punct' && toks[probeEnd].value === '{') {
      const bodyClose = findMatchingDelimiter(toks, probeEnd, '{', '}');
      if (bodyClose !== -1) {
        const parsed = parseFunctionExpression(toks.slice(i, bodyClose + 1));
        if (parsed && !parsed.isConcise) {
          fnExpr = parsed;
          nextIdx = bodyClose + 1;
        }
      }
    } else if (sawArrow && probeEnd > i) {
      const parsed = parseFunctionExpression(toks.slice(i, probeEnd));
      if (parsed && parsed.isConcise) {
        fnExpr = parsed;
        nextIdx = probeEnd;
      }
    }

    if (!fnExpr) return -1;

    const fnScope = new Map();
    const paramList = splitTopLevelCommas(fnExpr.paramsTokens);
    for (const paramToks of paramList) {
      if (paramToks[0] && paramToks[0].type === 'punct' && paramToks[0].value === '{') {
        this.bindPattern(paramToks, null, fnScope, true);
      }
    }
    scopeStack.push(fnScope);
    this.walkTokens(fnExpr.bodyTokens, scopeStack, fnDefs, currentHelperFile, depth);
    scopeStack.pop();
    return nextIdx;
  }

  /**
   * Attempts to walk a `const`/`let`/`var` declaration starting at token index `i`.
   * @param {Array<object>} toks
   * @param {number} i
   * @param {Array<Map<string, object>>} scopeStack
   * @param {Map<string, object>} fnDefs
   * @param {string} currentHelperFile
   * @param {number} depth
   * @returns {number} Next token index after declaration, or -1 if not matched
   */
  tryWalkDeclaration(toks, i, scopeStack, fnDefs, currentHelperFile, depth) {
    const t = toks[i];
    if (t.type !== 'ident' || !DECLARATION_KEYWORDS.has(t.value)) return -1;

    const nextTok = toks[i + 1];
    if (!nextTok || !((nextTok.type === 'punct' && nextTok.value === '{') || nextTok.type === 'ident')) {
      return -1;
    }

    let stmtEnd = i + 1;
    while (stmtEnd < toks.length && !(toks[stmtEnd].type === 'punct' && toks[stmtEnd].value === ';')) {
      if (stmtEnd > i + 1 && isAsiStatementBreak(toks[stmtEnd - 1], toks[stmtEnd])) {
        break;
      }
      if (toks[stmtEnd].type === 'punct' && (toks[stmtEnd].value === '(' || toks[stmtEnd].value === '{' || toks[stmtEnd].value === '[')) {
        const prevNonPunct = toks[stmtEnd - 1];
        const isDeclBrace = toks[stmtEnd].value === '{' && stmtEnd === i + 1;
        const nextIdx = advanceBalancedGroup(toks, stmtEnd);
        if (toks[stmtEnd].value === '{' && !isDeclBrace && prevNonPunct && prevNonPunct.value === '=>') {
          stmtEnd = nextIdx;
          break;
        }
        stmtEnd = nextIdx;
        continue;
      }
      stmtEnd++;
    }

    const declSlice = toks.slice(i + 1, stmtEnd);
    const decls = splitTopLevelCommas(declSlice);
    for (const decl of decls) {
      const eqIdx = findTopLevelEquals(decl, 0);
      if (eqIdx !== -1 && eqIdx + 1 < decl.length) {
        const patTokens = decl.slice(0, eqIdx);
        const rhsTokens = decl.slice(eqIdx + 1);
        this.walkTokens(rhsTokens, scopeStack, fnDefs, currentHelperFile, depth);
        const rhsVal = this.evalExpr(rhsTokens, scopeStack);
        if (rhsVal) {
          this.bindPattern(patTokens, rhsVal, scopeStack[scopeStack.length - 1], false);
        }
      } else {
        this.walkTokens(decl, scopeStack, fnDefs, currentHelperFile, depth);
      }
    }

    return (toks[stmtEnd] && toks[stmtEnd].type === 'punct' && toks[stmtEnd].value === ';')
      ? stmtEnd + 1
      : stmtEnd;
  }

  /**
   * Attempts to walk an assignment, fixture member chain, or helper invocation starting at identifier index `i`.
   * @param {Array<object>} toks
   * @param {number} i
   * @param {Array<Map<string, object>>} scopeStack
   * @param {Map<string, object>} fnDefs
   * @param {string} currentHelperFile
   * @param {number} depth
   * @returns {number} Next token index after handled construct, or -1 if unhandled
   */
  tryWalkIdentifierAction(toks, i, scopeStack, fnDefs, currentHelperFile, depth) {
    const t = toks[i];
    if (t.type !== 'ident') return -1;

    const prev = toks[i - 1];
    const precededByDot = prev && prev.type === 'punct' && (prev.value === '.' || prev.value === '?.');
    if (precededByDot) return -1;

    if (toks[i + 1] && toks[i + 1].type === 'punct' && toks[i + 1].value === '=') {
      let rhsEnd = i + 2;
      while (rhsEnd < toks.length && !(toks[rhsEnd].type === 'punct' && (toks[rhsEnd].value === ';' || toks[rhsEnd].value === '}'))) {
        if (rhsEnd > i + 2 && isAsiStatementBreak(toks[rhsEnd - 1], toks[rhsEnd])) {
          break;
        }
        if (toks[rhsEnd].type === 'punct' && (toks[rhsEnd].value === '(' || toks[rhsEnd].value === '{' || toks[rhsEnd].value === '[')) {
          rhsEnd = advanceBalancedGroup(toks, rhsEnd);
          continue;
        }
        rhsEnd++;
      }
      const rhsSlice = toks.slice(i + 2, rhsEnd);
      this.walkTokens(rhsSlice, scopeStack, fnDefs, currentHelperFile, depth);
      const rhsVal = this.evalExpr(rhsSlice, scopeStack);
      if (rhsVal) {
        scopeStack[scopeStack.length - 1].set(t.value, rhsVal);
      }
      return rhsEnd;
    }

    let cur = lookupBinding(t.value, scopeStack, this.effectiveRoots);
    if (cur) {
      this.recordIfLeaf(cur);
      let k = i + 1;
      while (k < toks.length) {
        const tk = toks[k];
        if (tk.type === 'punct' && (tk.value === '.' || tk.value === '?.') && toks[k + 1] && toks[k + 1].type === 'ident') {
          cur = accessBindingProperty(cur, toks[k + 1].value);
          if (!cur) break;
          this.recordIfLeaf(cur);
          k += 2;
        } else if (tk.type === 'punct' && tk.value === '(') {
          const closeArg = findMatchingDelimiter(toks, k, '(', ')');
          if (closeArg !== -1) {
            this.walkTokens(toks.slice(k + 1, closeArg), scopeStack, fnDefs, currentHelperFile, depth);
            k = closeArg + 1;
          } else {
            break;
          }
        } else if (tk.type === 'punct' && tk.value === '[') {
          const closeBr = findMatchingDelimiter(toks, k, '[', ']');
          if (closeBr !== -1) {
            this.walkTokens(toks.slice(k + 1, closeBr), scopeStack, fnDefs, currentHelperFile, depth);
            k = closeBr + 1;
          } else {
            break;
          }
        } else if (tk.type === 'punct' && tk.value === '!') {
          k++;
        } else {
          break;
        }
      }
      return k;
    }

    if (toks[i + 1] && toks[i + 1].type === 'punct' && toks[i + 1].value === '(') {
      const closeCall = findMatchingDelimiter(toks, i + 1, '(', ')');
      if (closeCall !== -1) {
        this.walkHelperCall(t.value, toks.slice(i + 2, closeCall), scopeStack, fnDefs, currentHelperFile, depth);
        return closeCall + 1;
      }
    }

    return -1;
  }

  /**
   * Evaluates arguments to a local or imported helper function and walks its body with bound parameters.
   * @param {string} fnName
   * @param {Array<object>} argRegionTokens
   * @param {Array<Map<string, object>>} scopeStack
   * @param {Map<string, object>} fnDefs
   * @param {string} currentHelperFile
   * @param {number} depth
   */
  walkHelperCall(fnName, argRegionTokens, scopeStack, fnDefs, currentHelperFile, depth) {
    const argSlices = splitTopLevelCommas(argRegionTokens);
    const evaluatedArgs = argSlices.map(argToks => {
      this.walkTokens(argToks, scopeStack, fnDefs, currentHelperFile, depth);
      return this.evalExpr(argToks, scopeStack);
    });

    if (!evaluatedArgs.some(Boolean)) return;

    let targetFn = fnDefs.get(fnName) || null;
    let helperFileForCall = currentHelperFile;

    if (!targetFn && this.importedHelpers.has(fnName)) {
      const impInfo = this.importedHelpers.get(fnName);
      if (impInfo && isRegularFile(impInfo.absPath)) {
        const extToks = this.moduleResolver.getFileTokens(impInfo.absPath);
        const extDefs = collectFunctionDefs(extToks);
        if (extDefs.has(impInfo.exportName)) {
          targetFn = extDefs.get(impInfo.exportName);
          helperFileForCall = impInfo.absPath;
        }
      }
    }

    if (!targetFn) return;

    const argSig = evaluatedArgs.map(v => v ? (v.kind === 'path' ? v.path : 'obj') : '_').join(',');
    const callKey = `${helperFileForCall}#${fnName}|${argSig}`;
    if (this.visitedHelperCalls.has(callKey)) return;

    this.visitedHelperCalls.add(callKey);
    const helperScope = new Map();
    const paramSlices = splitTopLevelCommas(targetFn.paramsTokens);
    for (let p = 0; p < paramSlices.length && p < evaluatedArgs.length; p++) {
      if (evaluatedArgs[p]) {
        this.bindPattern(paramSlices[p], evaluatedArgs[p], helperScope, false);
      }
    }
    const helperFns = helperFileForCall !== currentHelperFile
      ? collectFunctionDefs(this.moduleResolver.getFileTokens(helperFileForCall))
      : fnDefs;
    this.walkTokens(targetFn.bodyTokens, [helperScope], helperFns, helperFileForCall, depth + 1);
  }

  /**
   * Walks a token sequence in lexical scope to resolve chains, destructuring, aliases, and helper calls.
   * @param {Array<object>} toks
   * @param {Array<Map<string, object>>} scopeStack
   * @param {Map<string, object>} localFnMap
   * @param {string} currentHelperFile
   * @param {number} [depth=0]
   */
  walkTokens(toks, scopeStack, localFnMap, currentHelperFile, depth = 0) {
    if (depth > 4) return;
    const fnDefs = new Map(localFnMap);
    const localDefs = collectFunctionDefs(toks);
    for (const [k, v] of localDefs.entries()) fnDefs.set(k, v);

    let i = 0;
    while (i < toks.length) {
      const t = toks[i];

      if (t.type === 'punct' && t.value === '{') {
        const closeIdx = findMatchingDelimiter(toks, i, '{', '}');
        if (closeIdx !== -1) {
          scopeStack.push(new Map());
          this.walkTokens(toks.slice(i + 1, closeIdx), scopeStack, fnDefs, currentHelperFile, depth);
          scopeStack.pop();
          i = closeIdx + 1;
          continue;
        }
      }

      const callbackNext = this.tryWalkCallback(toks, i, scopeStack, fnDefs, currentHelperFile, depth);
      if (callbackNext !== -1) {
        i = callbackNext;
        continue;
      }

      const declNext = this.tryWalkDeclaration(toks, i, scopeStack, fnDefs, currentHelperFile, depth);
      if (declNext !== -1) {
        i = declNext;
        continue;
      }

      const identNext = this.tryWalkIdentifierAction(toks, i, scopeStack, fnDefs, currentHelperFile, depth);
      if (identNext !== -1) {
        i = identNext;
        continue;
      }

      i++;
    }
  }
}

/**
 * Extracts resolved workspace dependency IDs (direct ES imports, barrel re-exports, and spec fixture chains).
 */
class SpecDependencyResolver {
  /**
   * Creates a source/spec dependency resolver.
   * @param {import('./module-resolver').ModuleResolver} moduleResolver
   * @param {object|null} [fixtureLookup=null]
   */
  constructor(moduleResolver, fixtureLookup = null) {
    /** @type {import('./module-resolver').ModuleResolver} */
    this.moduleResolver = moduleResolver;
    /** @type {object|null} */
    this.fixtureLookup = fixtureLookup;
  }

  /**
   * Extracts raw resolved workspace dependency IDs for a source or spec file.
   * @param {string} filePath
   * @param {boolean} [isTest=false]
   * @param {string} [sourceContent='']
   * @returns {Array<string>}
   */
  extractFileImports(filePath, isTest = false, sourceContent = '') {
    const absPath = filePath ? path.resolve(filePath) : '';
    const { tokens } = scanJsTs(sourceContent, { collectTokens: true, collectSpans: false });
    const parsedImports = this.moduleResolver.parseImports(tokens, absPath);

    const importedModules = new Set();
    const importedFixtureMaps = [];
    const importedFixtureRoots = new Set();
    const importedHelperMap = new Map();

    const absFixturesDir = this.fixtureLookup && this.fixtureLookup.dirAbs ? this.fixtureLookup.dirAbs : '';

    for (const imp of parsedImports) {
      if (!imp.target) continue;

      if (absFixturesDir && imp.target.absPath && (imp.target.absPath === absFixturesDir || imp.target.absPath.startsWith(absFixturesDir + path.sep))) {
        if (this.fixtureLookup && this.fixtureLookup.byFile && this.fixtureLookup.byFile.has(imp.target.absPath)) {
          const fxInfo = this.fixtureLookup.byFile.get(imp.target.absPath);
          importedFixtureMaps.push(fxInfo.lookupMap);
          fxInfo.rootKeys.forEach(k => importedFixtureRoots.add(k));
        }
        continue;
      }

      const reExports = imp.target.foundOnDisk
        ? this.moduleResolver.getFileReExports(imp.target.absPath)
        : null;

      let resolvedViaReExport = false;

      if (imp.namedSpecs.length > 0 && reExports && reExports.hasReExports) {
        for (const spec of imp.namedSpecs) {
          if (reExports.symbolMap.has(spec.imported)) {
            reExports.symbolMap.get(spec.imported).forEach(t => importedModules.add(t));
            resolvedViaReExport = true;
          } else {
            importedModules.add(imp.target.workspaceId);
          }
        }
      } else if (imp.namespaceLocal && reExports && reExports.hasReExports) {
        reExports.allTargets.forEach(t => importedModules.add(t));
        resolvedViaReExport = reExports.allTargets.size > 0;
        if (reExports.hasLocalExports) {
          importedModules.add(imp.target.workspaceId);
        }
      } else if (imp.defaultLocal && reExports && reExports.hasReExports && reExports.symbolMap.has('default')) {
        reExports.symbolMap.get('default').forEach(t => importedModules.add(t));
        resolvedViaReExport = true;
      }

      if (!resolvedViaReExport && imp.target.workspaceId) {
        importedModules.add(imp.target.workspaceId);
      }

      if (isTest && imp.target.foundOnDisk && !imp.target.workspaceId.endsWith('.json')) {
        for (const spec of imp.namedSpecs) {
          importedHelperMap.set(spec.local, { absPath: imp.target.absPath, exportName: spec.imported });
        }
      }
    }

    if (isTest && this.fixtureLookup && this.fixtureLookup.combinedMap && this.fixtureLookup.combinedMap.size > 0) {
      let activeLookupMap = this.fixtureLookup.combinedMap;
      let activeRootKeys = this.fixtureLookup.combinedRoots || new Set();

      if (importedFixtureMaps.length > 0) {
        activeLookupMap = new Map();
        for (const m of importedFixtureMaps) {
          for (const [k, v] of m.entries()) {
            activeLookupMap.set(k, v);
          }
        }
        activeRootKeys = importedFixtureRoots;
      }

      const walker = new SpecChainWalker(
        { lookupMap: activeLookupMap, rootKeys: activeRootKeys },
        importedHelperMap,
        this.moduleResolver
      );
      walker.resolve(tokens, absPath).forEach(id => importedModules.add(id));
    }

    return Array.from(importedModules);
  }
}

module.exports = {
  lookupBinding,
  accessBindingProperty,
  SpecChainWalker,
  SpecDependencyResolver
};
