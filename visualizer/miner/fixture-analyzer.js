'use strict';

const fs = require('fs');
const path = require('path');
const { scanJsTs } = require('./lexer');
const {
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
  isAsiStatementBreak
} = require('./token-utils');

/**
 * Checks whether an expression starts with `new ClassName` and resolves the instantiated class symbol.
 * @param {Array<object>} exprTokens
 * @returns {string}
 */
function extractInstantiatedClass(exprTokens) {
  if (!exprTokens || exprTokens.length < 2) return '';
  if (exprTokens[0].type === 'ident' && exprTokens[0].value === 'new') {
    if (exprTokens[1].type === 'ident') {
      if (exprTokens[2] && exprTokens[2].type === 'punct' && exprTokens[2].value === '.' && exprTokens[3] && exprTokens[3].type === 'ident') {
        return `${exprTokens[1].value}.${exprTokens[3].value}`;
      }
      return exprTokens[1].value;
    }
  }
  return '';
}

/**
 * Extracts the second parameter identifier name (typically `use`) from fixture callback parameter tokens.
 * @param {Array<object>} paramsTokens
 * @returns {string}
 */
function extractUseCallbackName(paramsTokens) {
  const params = splitTopLevelCommas(paramsTokens);
  if (params.length < 2) return 'use';
  const second = params[1];
  if (second[0] && second[0].type === 'ident') {
    return second[0].value;
  }
  return 'use';
}

/**
 * Extracts getter and field definitions from tokens inside a local class declaration body.
 * @param {Array<object>} bodyTokens
 * @returns {Array<{ kind: 'getter'|'field', name: string, fnExpr?: object, valueTokens?: Array<object> }>}
 */
function parseClassMembers(bodyTokens) {
  const members = [];
  let mIdx = 0;

  while (mIdx < bodyTokens.length) {
    if (bodyTokens[mIdx].type === 'punct' && bodyTokens[mIdx].value === ';') {
      mIdx++;
      continue;
    }

    while (
      bodyTokens[mIdx] &&
      bodyTokens[mIdx].type === 'ident' &&
      ['public', 'private', 'protected', 'readonly', 'static', 'override', 'declare'].includes(bodyTokens[mIdx].value)
    ) {
      mIdx++;
    }
    const head = bodyTokens[mIdx];
    if (!head) break;

    if (head.type === 'ident' && head.value === 'get' && bodyTokens[mIdx + 1] && bodyTokens[mIdx + 1].type === 'ident') {
      const propName = bodyTokens[mIdx + 1].value;
      let bStart = mIdx + 2;
      while (bStart < bodyTokens.length && !(bodyTokens[bStart].type === 'punct' && bodyTokens[bStart].value === '{')) {
        if (bodyTokens[bStart].type === 'punct' && bodyTokens[bStart].value === '(') {
          bStart = advanceBalancedGroup(bodyTokens, bStart);
          continue;
        }
        bStart++;
      }
      if (bStart < bodyTokens.length) {
        const bClose = findMatchingDelimiter(bodyTokens, bStart, '{', '}');
        if (bClose !== -1) {
          const fnExpr = parseFunctionExpression([{ type: 'ident', value: 'function' }, ...bodyTokens.slice(mIdx + 2, bClose + 1)]);
          if (fnExpr) members.push({ kind: 'getter', name: propName, fnExpr });
          mIdx = bClose + 1;
          continue;
        }
      }
    }

    if (head.type === 'ident' && head.value === 'constructor' && bodyTokens[mIdx + 1] && bodyTokens[mIdx + 1].type === 'punct' && bodyTokens[mIdx + 1].value === '(') {
      const pClose = findMatchingDelimiter(bodyTokens, mIdx + 1, '(', ')');
      if (pClose !== -1) {
        let bStart = pClose + 1;
        while (bStart < bodyTokens.length && !(bodyTokens[bStart].type === 'punct' && bodyTokens[bStart].value === '{')) bStart++;
        if (bStart < bodyTokens.length) {
          const bClose = findMatchingDelimiter(bodyTokens, bStart, '{', '}');
          if (bClose !== -1) {
            const ctorStmts = splitTopLevelStatements(bodyTokens.slice(bStart + 1, bClose));
            for (const st of ctorStmts) {
              if (st[0]?.type === 'ident' && st[0].value === 'this' && st[1]?.type === 'punct' && st[1].value === '.' && st[2]?.type === 'ident' && st[3]?.type === 'punct' && st[3].value === '=') {
                members.push({ kind: 'field', name: st[2].value, valueTokens: st.slice(4) });
              }
            }
            mIdx = bClose + 1;
            continue;
          }
        }
      }
    }

    if (head.type === 'ident') {
      let nameIdx = mIdx;
      if (head.value === 'async' && bodyTokens[mIdx + 1]?.type === 'ident') nameIdx++;
      const memberTok = bodyTokens[nameIdx];
      const afterMember = bodyTokens[nameIdx + 1];
      if (memberTok?.type === 'ident' && afterMember && afterMember.type === 'punct' && (afterMember.value === ':' || afterMember.value === '=' || afterMember.value === '!' || afterMember.value === '?')) {
        let scan = nameIdx + 1;
        while (scan < bodyTokens.length && !(bodyTokens[scan].type === 'punct' && bodyTokens[scan].value === ';')) {
          if (scan > nameIdx + 1 && isAsiStatementBreak(bodyTokens[scan - 1], bodyTokens[scan])) break;
          if (bodyTokens[scan].type === 'punct' && (bodyTokens[scan].value === '(' || bodyTokens[scan].value === '{' || bodyTokens[scan].value === '[')) {
            scan = advanceBalancedGroup(bodyTokens, scan);
            continue;
          }
          scan++;
        }
        const fieldSlice = bodyTokens.slice(nameIdx + 1, scan);
        const eqIdx = findTopLevelEquals(fieldSlice, 0);
        if (eqIdx !== -1 && eqIdx + 1 < fieldSlice.length) {
          members.push({ kind: 'field', name: memberTok.value, valueTokens: fieldSlice.slice(eqIdx + 1) });
        }
        mIdx = scan + (bodyTokens[scan]?.value === ';' ? 1 : 0);
        continue;
      }
    }

    let k = mIdx;
    while (k < bodyTokens.length && !(bodyTokens[k].type === 'punct' && (bodyTokens[k].value === ';' || bodyTokens[k].value === '{'))) {
      if (bodyTokens[k].type === 'punct' && (bodyTokens[k].value === '(' || bodyTokens[k].value === '[')) {
        k = advanceBalancedGroup(bodyTokens, k);
        continue;
      }
      k++;
    }
    if (bodyTokens[k]?.value === '{') {
      k = advanceBalancedGroup(bodyTokens, k);
    } else if (bodyTokens[k]?.value === ';') {
      k++;
    }
    mIdx = k === mIdx ? mIdx + 1 : k;
  }

  return members;
}

/**
 * Extracts local class declarations and their getters, fields, and constructor assignments within a fixture file.
 * @param {Array<object>} tokens
 * @returns {Map<string, Array<{ kind: 'getter'|'field', name: string, fnExpr?: object, valueTokens?: Array<object> }>>}
 */
function collectLocalClasses(tokens) {
  const classes = new Map();
  let braceDepth = 0;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct') {
      if (t.value === '{') braceDepth++;
      else if (t.value === '}') braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (braceDepth === 0 && t.type === 'ident' && t.value === 'class' && tokens[i + 1] && tokens[i + 1].type === 'ident') {
      const className = tokens[i + 1].value;
      let j = i + 2;
      if (tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '<') {
        j = skipAngleBrackets(tokens, j);
      }
      while (j < tokens.length && !(tokens[j].type === 'punct' && tokens[j].value === '{')) {
        j++;
      }
      if (j >= tokens.length) continue;
      const closeBrace = findMatchingDelimiter(tokens, j, '{', '}');
      if (closeBrace === -1) continue;

      const bodyTokens = tokens.slice(j + 1, closeBrace);
      classes.set(className, parseClassMembers(bodyTokens));
      i = closeBrace;
    }
  }

  return classes;
}

/**
 * Parses fixture object graphs, member factories, getters, and local facade classes in a single fixture file.
 */
class FixtureFileParser {
  /**
   * Creates a single-file fixture parser.
   * @param {string} filePath
   * @param {import('./module-resolver').ModuleResolver} moduleResolver
   */
  constructor(filePath, moduleResolver) {
    /** @type {string} */
    this.absPath = path.resolve(filePath);
    /** @type {import('./module-resolver').ModuleResolver} */
    this.moduleResolver = moduleResolver;
    /** @type {string} */
    this.workspaceId = moduleResolver.toWorkspaceId(this.absPath);
    /** @type {Map<string, string>} */
    this.lookupMap = new Map();
    /** @type {Set<string>} */
    this.rootKeys = new Set();
    /** @type {Map<string, string>} */
    this.classToModuleMap = new Map();
    /** @type {object|null} */
    this.topAnalysis = null;
    /** @type {Map<string, Array<object>>} */
    this.localClasses = new Map();
  }

  /**
   * Analyzes the fixture file and returns its resolved property chain lookup map and root keys.
   * @returns {{ lookupMap: Map<string, string>, rootKeys: Set<string>, absPath: string, workspaceId: string }}
   */
  analyze() {
    let content;
    try {
      content = fs.readFileSync(this.absPath, 'utf8');
    } catch (_) {
      return {
        lookupMap: this.lookupMap,
        rootKeys: this.rootKeys,
        absPath: this.absPath,
        workspaceId: this.workspaceId
      };
    }

    const tokens = scanJsTs(content, { collectTokens: true, collectSpans: false }).tokens;
    this.indexImports(tokens);
    this.topAnalysis = analyzeBlockBody(tokens);
    this.localClasses = collectLocalClasses(tokens);
    this.walkExtendCalls(tokens);

    return {
      lookupMap: this.lookupMap,
      rootKeys: this.rootKeys,
      absPath: this.absPath,
      workspaceId: this.workspaceId
    };
  }

  /**
   * Indexes imported classes and re-exported symbols into `classToModuleMap`.
   * @param {Array<object>} tokens
   */
  indexImports(tokens) {
    const parsedImports = this.moduleResolver.parseImports(tokens, this.absPath);
    for (const imp of parsedImports) {
      if (!imp.target) continue;
      const reExports = imp.target.foundOnDisk ? this.moduleResolver.getFileReExports(imp.target.absPath) : null;

      if (imp.defaultLocal) {
        const targetId = this.moduleResolver.resolveFirstSymbolTarget(reExports, 'default', imp.target.workspaceId);
        if (targetId) this.classToModuleMap.set(imp.defaultLocal, targetId);
      }

      if (imp.namespaceLocal) {
        this.classToModuleMap.set(`__ns:${imp.namespaceLocal}`, imp.target.workspaceId);
      }

      for (const spec of imp.namedSpecs) {
        const targetId = this.moduleResolver.resolveFirstSymbolTarget(reExports, spec.imported, imp.target.workspaceId);
        if (targetId) this.classToModuleMap.set(spec.local, targetId);
      }
    }
  }

  /**
   * Resolves an imported class identifier (direct or namespace-qualified) to a workspace module ID.
   * @param {string} className
   * @returns {string}
   */
  resolveClassTarget(className) {
    if (!className) return '';
    if (this.classToModuleMap.has(className)) return this.classToModuleMap.get(className);
    if (className.includes('.')) {
      const ns = className.split('.')[0];
      if (this.classToModuleMap.has(`__ns:${ns}`)) return this.classToModuleMap.get(`__ns:${ns}`);
    }
    return '';
  }

  /**
   * Unwraps `[await] useParam(arg0, ...)` from concise fixture arrow bodies.
   * @param {Array<object>} bodyToks
   * @param {string} useParamName
   * @returns {Array<object>|null}
   */
  extractConciseUseArg(bodyToks, useParamName) {
    const inner = unwrapExpression(bodyToks);
    let idx = 0;
    if (inner[idx] && inner[idx].type === 'ident' && inner[idx].value === 'await') {
      idx++;
    }
    if (
      inner[idx] &&
      inner[idx].type === 'ident' &&
      inner[idx].value === useParamName &&
      inner[idx + 1] &&
      inner[idx + 1].type === 'punct' &&
      inner[idx + 1].value === '('
    ) {
      const closeParen = findMatchingDelimiter(inner, idx + 1, '(', ')');
      if (closeParen !== -1) {
        const callArgs = splitTopLevelCommas(inner, idx + 2, closeParen);
        return callArgs[0] || null;
      }
    }
    return null;
  }

  /**
   * Resolves a fixture function or factory body via Playwright `use(...)` or `return` expressions.
   * @param {object} fnExpr
   * @param {Array<string>} prefixPath
   * @param {Array<object>} envStack
   * @param {Set<string>} visited
   * @param {boolean} [allowUseCallback=true]
   */
  resolveFixtureFunction(fnExpr, prefixPath, envStack, visited, allowUseCallback = true) {
    if (fnExpr.isConcise) {
      if (allowUseCallback) {
        const useParamName = extractUseCallbackName(fnExpr.paramsTokens);
        const useArg = this.extractConciseUseArg(fnExpr.bodyTokens, useParamName);
        if (useArg) {
          this.resolveValueExpr(useArg, prefixPath, envStack, visited);
          return;
        }
      }
      this.resolveValueExpr(fnExpr.bodyTokens, prefixPath, envStack, visited);
      return;
    }

    const bodyAnalysis = analyzeBlockBody(fnExpr.bodyTokens);
    const childEnv = [...envStack, bodyAnalysis];
    let foundUseCall = false;

    if (allowUseCallback) {
      const useParamName = extractUseCallbackName(fnExpr.paramsTokens);
      for (const call of bodyAnalysis.calls) {
        if (call.callee === useParamName && call.args[0]) {
          foundUseCall = true;
          this.resolveValueExpr(call.args[0], prefixPath, childEnv, visited);
        }
      }
    }

    if (!foundUseCall && bodyAnalysis.returns.length > 0) {
      for (const retExpr of bodyAnalysis.returns) {
        this.resolveValueExpr(retExpr, prefixPath, childEnv, visited);
      }
    }
  }

  /**
   * Walks any expression tokens inside a fixture definition to record `chain -> workspaceId` mappings.
   * @param {Array<object>} rawExpr
   * @param {Array<string>} prefixPath
   * @param {Array<object>} envStack
   * @param {Set<string>} [visited=new Set()]
   */
  resolveValueExpr(rawExpr, prefixPath, envStack, visited = new Set()) {
    const expr = unwrapExpression(rawExpr);
    if (expr.length === 0) return;

    if (expr[0].type === 'punct' && expr[0].value === '[') return;

    const directClass = extractInstantiatedClass(expr);
    if (directClass) {
      const targetId = this.resolveClassTarget(directClass);
      if (targetId && prefixPath.length > 0) {
        this.lookupMap.set(prefixPath.join('.'), targetId);
        return;
      }
      const clsDef = this.localClasses.get(directClass);
      const classVisitKey = `${prefixPath.join('.')}:class:${directClass}`;
      if (clsDef && !visited.has(classVisitKey)) {
        visited.add(classVisitKey);
        for (const member of clsDef) {
          if (member.kind === 'getter') {
            this.resolveFixtureFunction(member.fnExpr, [...prefixPath, member.name], [this.topAnalysis], visited, false);
          } else if (member.kind === 'field') {
            this.resolveValueExpr(member.valueTokens, [...prefixPath, member.name], [this.topAnalysis], visited);
          }
        }
        visited.delete(classVisitKey);
      }
      return;
    }

    if (expr[0].type === 'punct' && expr[0].value === '{') {
      const closeIdx = findMatchingDelimiter(expr, 0, '{', '}');
      if (closeIdx !== -1) {
        this.walkObjectLiteral(expr.slice(1, closeIdx), prefixPath, envStack, visited);
      }
      return;
    }

    const fnExpr = parseFunctionExpression(expr);
    if (fnExpr) {
      this.resolveFixtureFunction(fnExpr, prefixPath, envStack, visited, true);
      return;
    }

    if (expr.length === 1 && expr[0].type === 'ident') {
      const varName = expr[0].value;
      const visitKey = `${prefixPath.join('.')}:${varName}`;
      if (visited.has(visitKey)) return;
      for (let s = envStack.length - 1; s >= 0; s--) {
        if (envStack[s].vars && envStack[s].vars.has(varName)) {
          visited.add(visitKey);
          this.resolveValueExpr(envStack[s].vars.get(varName), prefixPath, envStack, visited);
          visited.delete(visitKey);
          return;
        }
        if (envStack[s].fns && envStack[s].fns.has(varName)) {
          visited.add(visitKey);
          this.resolveFixtureFunction(envStack[s].fns.get(varName), prefixPath, envStack, visited, true);
          visited.delete(visitKey);
          return;
        }
      }
      return;
    }

    if (expr[0].type === 'ident' && expr[1] && expr[1].type === 'punct' && expr[1].value === '(') {
      const fnName = expr[0].value;
      const visitKey = `${prefixPath.join('.')}:call:${fnName}`;
      if (visited.has(visitKey)) return;
      for (let s = envStack.length - 1; s >= 0; s--) {
        if (envStack[s].fns && envStack[s].fns.has(fnName)) {
          visited.add(visitKey);
          this.resolveFixtureFunction(envStack[s].fns.get(fnName), prefixPath, envStack, visited, false);
          visited.delete(visitKey);
          return;
        }
      }
    }
  }

  /**
   * Walks every member inside a fixture object literal `{ ... }`.
   * @param {Array<object>} innerTokens
   * @param {Array<string>} prefixPath
   * @param {Array<object>} envStack
   * @param {Set<string>} visited
   */
  walkObjectLiteral(innerTokens, prefixPath, envStack, visited) {
    const props = parseObjectLiteralProperties(innerTokens);
    for (const prop of props) {
      if (prop.kind === 'spread') {
        this.resolveValueExpr(prop.valueTokens, prefixPath, envStack, visited);
      } else if (prop.kind === 'pair' || prop.kind === 'shorthand') {
        this.resolveValueExpr(prop.valueTokens, [...prefixPath, prop.name], envStack, visited);
      } else if (prop.kind === 'getter' || prop.kind === 'method') {
        this.resolveFixtureFunction(prop.fnExpr, [...prefixPath, prop.name], envStack, visited, false);
      }
    }
  }

  /**
   * Scans the file token stream for `.extend<...>({ ... })` calls and walks each object literal argument.
   * @param {Array<object>} tokens
   */
  walkExtendCalls(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'punct' || t.value !== '.' || !tokens[i + 1] || tokens[i + 1].type !== 'ident' || tokens[i + 1].value !== 'extend') {
        continue;
      }

      let openIdx = i + 2;
      if (tokens[openIdx] && tokens[openIdx].type === 'punct' && tokens[openIdx].value === '<') {
        openIdx = skipAngleBrackets(tokens, openIdx);
      }
      if (!tokens[openIdx] || tokens[openIdx].type !== 'punct' || tokens[openIdx].value !== '(') {
        continue;
      }
      const closeIdx = findMatchingDelimiter(tokens, openIdx, '(', ')');
      if (closeIdx === -1) continue;

      const extendArgs = splitTopLevelCommas(tokens, openIdx + 1, closeIdx);
      const objArg = extendArgs.find(arg => arg[0] && arg[0].type === 'punct' && arg[0].value === '{');
      if (!objArg) continue;

      const objClose = findMatchingDelimiter(objArg, 0, '{', '}');
      if (objClose === -1) continue;

      this.processExtendObject(objArg.slice(1, objClose));
      i = closeIdx;
    }
  }

  /**
   * Extracts root fixture keys and resolves each fixture provider inside a `.extend({ ... })` argument.
   * @param {Array<object>} objTokens
   */
  processExtendObject(objTokens) {
    const rootProps = parseObjectLiteralProperties(objTokens);
    for (const prop of rootProps) {
      if (!prop.name) continue;

      if (prop.kind === 'pair') {
        const valExpr = unwrapExpression(prop.valueTokens);
        if (valExpr[0] && valExpr[0].type === 'punct' && valExpr[0].value === '[') {
          continue;
        }
        this.rootKeys.add(prop.name);

        const fnExpr = parseFunctionExpression(valExpr);
        if (fnExpr) {
          this.resolveFixtureFunction(fnExpr, [prop.name], [this.topAnalysis], new Set(), true);
        } else {
          this.resolveValueExpr(valExpr, [prop.name], [this.topAnalysis]);
        }
      } else if (prop.kind === 'method') {
        this.rootKeys.add(prop.name);
        this.resolveFixtureFunction(prop.fnExpr, [prop.name], [this.topAnalysis], new Set(), true);
      } else if (prop.kind === 'shorthand') {
        this.rootKeys.add(prop.name);
        this.resolveValueExpr(prop.valueTokens, [prop.name], [this.topAnalysis]);
      }
    }
  }
}

/**
 * Orchestrates fixture file parsing and combined lookup table construction across a `fixturesDir`.
 */
class FixtureAnalyzer {
  /**
   * Creates a fixture analyzer backed by a shared `ModuleResolver`.
   * @param {import('./module-resolver').ModuleResolver} moduleResolver
   */
  constructor(moduleResolver) {
    /** @type {import('./module-resolver').ModuleResolver} */
    this.moduleResolver = moduleResolver;
  }

  /**
   * Parses a single fixture file into its resolved lookup map and root keys.
   * @param {string} filePath
   * @returns {{ lookupMap: Map<string, string>, rootKeys: Set<string>, absPath: string, workspaceId: string }}
   */
  analyzeFile(filePath) {
    return new FixtureFileParser(filePath, this.moduleResolver).analyze();
  }

  /**
   * Builds combined and per-file fixture lookup maps from all fixture files in `fixturesDir`.
   * @param {string} fixturesDir
   * @returns {{ combinedMap: Map<string, string>, combinedRoots: Set<string>, byFile: Map<string, object>, dirAbs: string }}
   */
  buildLookup(fixturesDir) {
    const combinedMap = new Map();
    const combinedRoots = new Set();
    const byFile = new Map();
    const dirAbs = path.resolve(fixturesDir);

    if (!fs.existsSync(dirAbs)) {
      return { combinedMap, combinedRoots, byFile, dirAbs };
    }

    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    const fixtureFiles = entries
      .filter(e => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.js')) && !e.name.endsWith('.d.ts') && !e.name.startsWith('.'))
      .map(e => e.name);

    for (const file of fixtureFiles) {
      const filePath = path.join(dirAbs, file);
      const parsed = this.analyzeFile(filePath);
      byFile.set(parsed.absPath, parsed);
      parsed.rootKeys.forEach(rk => combinedRoots.add(rk));
      for (const [chain, modId] of parsed.lookupMap.entries()) {
        combinedMap.set(chain, modId);
      }
    }

    return { combinedMap, combinedRoots, byFile, dirAbs };
  }
}

module.exports = {
  extractInstantiatedClass,
  extractUseCallbackName,
  collectLocalClasses,
  FixtureFileParser,
  FixtureAnalyzer
};
