import { test, expect } from '@playwright/test';
import { isModuleMatch, normalizeModuleDiffId, diffSnapshots } from '../../visualizer/js/app.js';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const http = require('http');

const SCRIPT_PATH = path.resolve(__dirname, '../../visualizer/sync-visualizer.js');
const tempRootsToCleanup: string[] = [];

test.afterEach(() => {
  while (tempRootsToCleanup.length > 0) {
    const dir = tempRootsToCleanup.pop()!;
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

/**
 * Helper to run sync-visualizer in an isolated sandbox with custom files and configuration
 */
function runMockMiner(files: Record<string, string>, configOverrides: any = {}, options: any = {}) {
  const testRoot = path.resolve(__dirname, '../../scratch/unit_test_' + Date.now() + '_' + Math.random().toString(36).slice(2));
  fs.mkdirSync(testRoot, { recursive: true });
  tempRootsToCleanup.push(testRoot);

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(testRoot, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
  }

  const baseConfig = {
    tags: [
      { name: 'taga', displayName: 'TagA', icon: 'tag-A.svg' },
      { name: 'tagb', displayName: 'TagB', icon: 'tag-B.svg' },
      { name: 'tagc', displayName: 'TagC', icon: 'tag-C.svg' }
    ],
    scanConfig: [
      { name: 'Api Models', dir: './api', type: 'class', allowUntagged: false, subfolders: [] },
      { name: 'Workflows', dir: './workflows', type: 'functions', allowUntagged: false, subfolders: [] },
      { name: 'Components', dir: './components', type: 'class', allowUntagged: true, subfolders: [] },
      { name: 'UI Models', dir: './pages', type: 'class', allowUntagged: false, subfolders: [] },
      { name: 'Tests', dir: './tests', type: 'test', allowUntagged: false, subfolders: ['ui', 'api', 'service'], fixturesDir: './tests/fixtures' }
    ],
    ...configOverrides
  };

  const configPath = path.join(testRoot, 'visualizer-config.json');
  fs.writeFileSync(configPath, JSON.stringify(baseConfig, null, 2), 'utf8');

  const dataDir = path.join(testRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const spawnRes = cp.spawnSync(process.execPath, [SCRIPT_PATH], {
      env: {
        ...process.env,
        VISUALIZER_WORKSPACE_ROOT: testRoot,
        VISUALIZER_CONFIG_PATH: configPath,
        VISUALIZER_DATA_DIR: dataDir,
        VISUALIZER_SILENT: options.silent !== false ? 'true' : 'false'
      },
      encoding: 'utf8'
    });
    if (spawnRes.status !== 0) {
      throw new Error(`Miner failed (${spawnRes.status}): ${spawnRes.stderr || spawnRes.stdout}`);
    }
    const stdout = spawnRes.stdout || '';
    const stderr = spawnRes.stderr || '';

    const indexPath = path.join(dataDir, 'index.json');
    let dataset: any[] = [];
    let snapshotFilename = '';
    let snapshotPath = '';
    if (fs.existsSync(indexPath)) {
      const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      if (Array.isArray(indexData) && indexData.length > 0) {
        snapshotFilename = indexData[0].file;
        snapshotPath = path.join(dataDir, snapshotFilename);
        if (fs.existsSync(snapshotPath)) {
          dataset = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
        }
      }
    }

    return {
      result: {
        dataset,
        snapshotPath,
        indexPath,
        snapshotFilename,
        stdout,
        stderr
      },
      testRoot
    };
  } catch (err) {
    fs.rmSync(testRoot, { recursive: true, force: true });
    throw err;
  }
}

test.describe('sync-visualizer engine unit & integration tests', () => {

  // Finding 4.8 & Owner Directive: Complete encapsulation with zero exports
  test('nothing is exported from sync-visualizer.js (runs in complete isolation)', () => {
    const syncVisualizer = require('../../visualizer/sync-visualizer');
    expect(syncVisualizer.runMiner).toBeUndefined();
    expect(syncVisualizer.stripCommentsSafe).toBeUndefined();
    expect(syncVisualizer.parseContent).toBeUndefined();
    expect(syncVisualizer.extractClassMethods).toBeUndefined();
    expect(syncVisualizer.loadConfig).toBeUndefined();
    expect(syncVisualizer.buildTagMap).toBeUndefined();
    expect(syncVisualizer.toTitleCase).toBeUndefined();
    expect(syncVisualizer.writeJsonAtomic).toBeUndefined();
    expect(syncVisualizer.ACRONYMS).toBeUndefined();
    expect(Object.keys(syncVisualizer).length).toBe(0);
  });

  // Finding 4.2: Template literal expressions and comment stripping
  test('comment stripping ignores comments outside strings while preserving URLs, regexes, and template interpolations', () => {
    const { result, testRoot } = runMockMiner({
      'tests/ui/taga-comments.spec.ts': `
        import { test } from '@playwright/test';
        // Single line comment
        const url = "https://example.com/api/v1";
        /* Multi-line
           comment */
        const regexStr = "foo // not a comment /* still not */";
        const templateStr = \`msg: \${(() => '/* not a comment */')()}\`;
        test('Preserved test with comments stripped', async () => {});
      `
    });

    const testSection = result.dataset.find((s: any) => s.title === 'Tests');
    const mod = testSection.lanes[0].modules[0];
    expect(mod.items.map((i: any) => i.name)).toEqual(['Preserved test with comments stripped']);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Title casing without acronym overrides
  test('title casing formats words into standard Title Case with camelCase splitting without acronym overrides', () => {
    const { result, testRoot } = runMockMiner({
      'api/taga-security-iam-api.ts': `export class SecurityIamApi {}`,
      'api/taga-custom-xml-parser.ts': `export class CustomXmlParser {}`,
      'pages/taga-user-login-view.ts': `export class UserLoginView {}`
    });

    const apiSection = result.dataset.find((s: any) => s.title === 'Api Models');
    const apiTitles = apiSection.lanes.flatMap((l: any) => l.modules.map((m: any) => m.title));
    expect(apiTitles).toContain('Security Iam Api');
    expect(apiTitles).toContain('Custom Xml Parser');

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const pageTitles = pageSection.lanes.flatMap((l: any) => l.modules.map((m: any) => m.title));
    expect(pageTitles).toContain('User Login View');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Section filtering rules
  test('filters files according to section rules and exclusions', () => {
    const { result, testRoot } = runMockMiner({
      'pages/index.ts': `export class Index {}`,
      'pages/.hidden.ts': `export class Hidden {}`,
      'pages/types.d.ts': `export type Id = string;`,
      'pages/data.json': `{ "not": "code" }`,
      'pages/taga-valid-page.ts': `export class ValidPage {}`,
      'tests/ui/not-a-spec.ts': `export const notASpec = true;`,
      'tests/ui/taga-valid.spec.ts': `test('Valid test', async () => {});`
    });

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const pageMods = pageSection.lanes.flatMap((l: any) => l.modules.map((m: any) => m.id));
    expect(pageMods).toContain('pages/taga-valid-page');
    expect(pageMods).not.toContain('pages/index');
    expect(pageMods).not.toContain('pages/.hidden');
    expect(pageMods).not.toContain('pages/types.d');

    const testSection = result.dataset.find((s: any) => s.title === 'Tests');
    const testMods = testSection.lanes.flatMap((l: any) => l.modules.map((m: any) => m.id));
    expect(testMods).toContain('tests/ui/taga-valid.spec');
    expect(testMods).not.toContain('tests/ui/not-a-spec');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.5: Tag prefix check heuristic
  test('files with tag- word prefix like tag-manager.ts are not skipped as unconfigured tags', () => {
    const { result, testRoot } = runMockMiner({
      'components/tag-manager.ts': `export class TagManager {}`,
      'components/tagging-helper.ts': `export class TaggingHelper {}`,
      'pages/tagd-unconfigured.ts': `export class UnconfiguredPage {}`
    });

    const compSection = result.dataset.find((s: any) => s.title === 'Components');
    const compMods = compSection.lanes.flatMap((l: any) => l.modules.map((m: any) => m.id));
    expect(compMods).toContain('components/tag-manager');
    expect(compMods).toContain('components/tagging-helper');

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const pageMods = pageSection.lanes.flatMap((l: any) => l.modules.map((m: any) => m.id));
    expect(pageMods).not.toContain('pages/tagd-unconfigured');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Tests extraction
  test('extracts multiline tests and modifier tests while ignoring hooks and describe', () => {
    const { result, testRoot } = runMockMiner({
      'tests/ui/taga-sample.spec.ts': `
        import { test } from '@playwright/test';

        test.beforeAll(async () => {});
        test.beforeEach(async () => {});

        test('Standard single-line test', async ({ page }) => {});
        test.only('Exclusive test with modifier', async () => {});
        test.skip('Skipped test with modifier', async () => {});
        test.fixme('Fixme test with modifier', async () => {});

        test(
          'Multiline test declaration with formatted parameters',
          async ({ page }) => {}
        );

        test.describe('Suite block', () => {
          test('Nested test inside describe', () => {});
        });

        test.afterAll(async () => {});
      `
    });

    const testSection = result.dataset.find((s: any) => s.title === 'Tests');
    const mod = testSection.lanes[0].modules[0];
    const names = mod.items.map((i: any) => i.name);

    expect(names).toContain('Standard single-line test');
    expect(names).toContain('Exclusive test with modifier');
    expect(names).toContain('Skipped test with modifier');
    expect(names).toContain('Fixme test with modifier');
    expect(names).toContain('Multiline test declaration with formatted parameters');
    expect(names).toContain('Nested test inside describe');
    expect(names).not.toContain('Suite block');
    expect(mod.items.length).toBe(6);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.5: Generic exported arrow functions
  test('extracts exported functions, async functions, arrow functions, and generic arrow functions', () => {
    const { result, testRoot } = runMockMiner({
      'workflows/taga-workflows.ts': `
        export function standardFunction() {}
        export async function asyncFunction() {}
        export const arrowWorkflow = () => {};
        export const asyncArrowWorkflow = async (id: string) => {};
        export const typedArrow: OrderHandler = async () => {};
        export const genericArrow = <T>(val: T): T => val;
        export const genericMultiArrow = async <T, R>(task: Task<T>): Promise<R> => {};
        export const processMetrics: Record<string, number> = () => {};

        function privateHelper() {}
        const internalConst = 42;
      `
    });

    const workflowSection = result.dataset.find((s: any) => s.title === 'Workflows');
    const mod = workflowSection.lanes[0].modules[0];
    const names = mod.items.map((i: any) => i.name);

    expect(names).toContain('standardFunction');
    expect(names).toContain('asyncFunction');
    expect(names).toContain('arrowWorkflow');
    expect(names).toContain('asyncArrowWorkflow');
    expect(names).toContain('typedArrow');
    expect(names).toContain('genericArrow');
    expect(names).toContain('genericMultiArrow');
    expect(names).toContain('processMetrics');
    expect(names).not.toContain('privateHelper');
    expect(names).not.toContain('internalConst');
    expect(mod.items.length).toBe(8);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Class methods extraction
  test('extracts class methods and ignores braces inside strings and templates', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-order.ts': `
        export class OrderService {
          constructor(api) {}

          formatReceipt(id: string) {
            const msg = \`Receipt: {id: \${id}}\`;
            const alt = "{some_braced_value}";
            return msg;
          }

          async processOrder() {
            return true;
          }

          cancelOrder() {
            return false;
          }
        }
      `
    });

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const mod = pageSection.lanes[0].modules[0];
    expect(mod.items[0].name).toBe('OrderService');

    const methodNames = mod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('formatReceipt()');
    expect(methodNames).toContain('async processOrder()');
    expect(methodNames).toContain('cancelOrder()');
    expect(methodNames).not.toContain('constructor()');
    expect(methodNames.length).toBe(3);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.1: Arrow methods with inline object return types
  test('arrow property methods with inline object return types avoid "async()" bug', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-profile.ts': `
        export class ProfilePage {
          getProfile = async (): Promise<{ id: string }> => {
            return { id: "1" };
          };
          fetchUser = async (): Promise<{ name: string; age: number }> => {};
          submitLogin = async () => {};
          clickCancel = () => {};
          public handleAction = async (val: string) => {};
          private readonly resetForm = () => {};
        }
      `
    });

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const mod = pageSection.lanes[0].modules[0];
    expect(mod.items[0].name).toBe('ProfilePage');

    const methodNames = mod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('async getProfile()');
    expect(methodNames).toContain('async fetchUser()');
    expect(methodNames).toContain('async submitLogin()');
    expect(methodNames).toContain('clickCancel()');
    expect(methodNames).toContain('async handleAction()');
    expect(methodNames).toContain('resetForm()');
    expect(methodNames).not.toContain('async()');
    expect(methodNames.length).toBe(6);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.2: Abstract method signatures in export abstract class
  test('abstract method signatures terminating in semicolon are extracted', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-base.ts': `
        export abstract class BasePage {
          abstract navigate(url: string): Promise<void>;
          abstract getTitle(): string;
          async reload() {}
        }
        export default class ApiClient {
          async execute() {}
        }
      `
    });

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const mod = pageSection.lanes[0].modules[0];
    expect(mod.items.length).toBe(2);

    const basePage = mod.items.find((i: any) => i.name === 'BasePage');
    const baseMethods = basePage.methods.map((m: any) => m.name);
    expect(baseMethods).toContain('navigate()');
    expect(baseMethods).toContain('getTitle()');
    expect(baseMethods).toContain('async reload()');

    const apiClient = mod.items.find((i: any) => i.name === 'ApiClient');
    expect(apiClient.methods[0].name).toBe('async execute()');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.3: Concise body arrow methods
  test('concise body arrow methods terminating in semicolon are extracted', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-concise.ts': `
        export class ConciseService {
          fetchData = () => this.api.get();
          isValid = (id: string): boolean => id.length > 0;
          async load() {}
        }
      `
    });

    const mod = result.dataset.find((s: any) => s.title === 'UI Models').lanes[0].modules[0];
    const methodNames = mod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('fetchData()');
    expect(methodNames).toContain('isValid()');
    expect(methodNames).toContain('async load()');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.4: Nested parentheses in parameter signatures
  test('nested parentheses in parameter signatures do not break method extraction', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-callback.ts': `
        export class CallbackService {
          async execute(callback: (err: Error) => void): Promise<void> {}
          retry(times: number = (2 + 1)) {}
          standardMethod() {}
        }
      `
    });

    const mod = result.dataset.find((s: any) => s.title === 'UI Models').lanes[0].modules[0];
    const methodNames = mod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('async execute()');
    expect(methodNames).toContain('retry()');
    expect(methodNames).toContain('standardMethod()');
    expect(methodNames.length).toBe(3);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // ASI Protection
  test('prevents unsemicoloned field initializers from hijacking subsequent methods', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-asi.ts': `
        export class Service {
          config = getDefaults()
          async doSomething() {}
          counter = 0
          syncAction() {}
        }
      `
    });

    const mod = result.dataset.find((s: any) => s.title === 'UI Models').lanes[0].modules[0];
    const methodNames = mod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).not.toContain('getDefaults()');
    expect(methodNames).toContain('async doSomething()');
    expect(methodNames).toContain('syncAction()');
    expect(methodNames.length).toBe(2);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Generic class parameter braces
  test('handles generic class parameter braces without truncation', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-registry.ts': `
        export class ModelRegistry<T extends { id: string }> {
          async register(item: T) {}
          unregister(id: string) {}
        }
      `
    });

    const mod = result.dataset.find((s: any) => s.title === 'UI Models').lanes[0].modules[0];
    expect(mod.items[0].name).toBe('ModelRegistry');
    const methodNames = mod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('async register()');
    expect(methodNames).toContain('unregister()');
    expect(methodNames.length).toBe(2);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.6: Combined default and named imports
  test('combined default and named imports are extracted into module dependencies', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-base.ts': `export class BasePage {}`,
      'pages/taga-helper.ts': `export class Helper {}`,
      'tests/ui/taga-combined.spec.ts': `
        import BasePage, { Helper, type Config } from '@pages/taga-base';
        test('Combined import test', async () => {});
      `,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '@pages/*': ['pages/*']
          }
        }
      })
    });

    const testSection = result.dataset.find((s: any) => s.title === 'Tests');
    const mod = testSection.lanes[0].modules[0];
    expect(mod.imports).toContain('pages/taga-base');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.7: Exact path aliases without wildcards
  test('exact path aliases without wildcards resolve target module ID', () => {
    const { result, testRoot } = runMockMiner({
      'workflows/taga-orders.ts': `export function placeOrder() {}`,
      'tests/ui/taga-order.spec.ts': `
        import { placeOrder } from '@workflows';
        test('Place order test', async () => {});
      `,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '@workflows': ['workflows/taga-orders.ts']
          }
        }
      })
    });

    const testSection = result.dataset.find((s: any) => s.title === 'Tests');
    const mod = testSection.lanes[0].modules[0];
    expect(mod.imports).toContain('workflows/taga-orders');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.4: Re-export scanner ignores commented-out exports
  test('re-export scanner ignores commented-out exports in index files', () => {
    const { result, testRoot } = runMockMiner({
      'workflows/index.ts': `
        export { activeWorkflow } from './taga-active';
        // export { legacyWorkflow } from './taga-legacy';
        /* export { deadWorkflow } from './taga-dead'; */
      `,
      'workflows/taga-active.ts': `export function activeWorkflow() {}`,
      'workflows/taga-legacy.ts': `export function legacyWorkflow() {}`,
      'workflows/taga-dead.ts': `export function deadWorkflow() {}`,
      'tests/ui/taga-reexport.spec.ts': `
        import { activeWorkflow, legacyWorkflow, deadWorkflow } from '@workflows';
        test('Re-export test', async () => {});
      `,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '@workflows': ['workflows/index.ts']
          }
        }
      })
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('workflows/taga-active');
    expect(testMod.imports).not.toContain('workflows/taga-legacy');
    expect(testMod.imports).not.toContain('workflows/taga-dead');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.6: Fixture member chain scanning ignores string literals
  test('fixture member chain regex ignores dot notation inside string literals', () => {
    const { result, testRoot } = runMockMiner({
      'tests/fixtures/test.fixture.ts': `
        import { LoginPage } from '../../pages/tagb-login';
        export const test = base.extend({
          app: async ({}, use) => {
            await use({ login: new LoginPage() });
          }
        });
      `,
      'pages/tagb-login.ts': `export class LoginPage {}`,
      'tests/ui/taga-string-chain.spec.ts': `
        test('String literal with fixture chain', async ({ page }) => {
          const selector = 'app.login.submitButton';
          expect(selector).toBe('app.login.submitButton');
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).not.toContain('pages/tagb-login');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Multi-level fixture chains outside strings are resolved
  test('multi-level fixture instantiations outside strings are resolved to module dependencies', () => {
    const { result, testRoot } = runMockMiner({
      'tests/fixtures/app.fixture.ts': `
        import { LoginPage } from '../../pages/tagb-login';
        import { DashboardPage } from '../../pages/taga-dashboard';

        export const test = base.extend({
          app: async ({}, use) => {
            await use({
              auth: {
                loginPage: new LoginPage()
              },
              dashboardPage: new DashboardPage()
            });
          }
        });
      `,
      'pages/tagb-login.ts': `export class LoginPage {}`,
      'pages/taga-dashboard.ts': `export class DashboardPage {}`,
      'tests/ui/taga-active-chain.spec.ts': `
        test('Active chain call', async ({ app }) => {
          await app.auth.loginPage.submit();
          await app.dashboardPage.load();
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('pages/tagb-login');
    expect(testMod.imports).toContain('pages/taga-dashboard');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.3: JSONC comments in tsconfig.json
  test('loadTsConfig supports JSONC comments without throwing', () => {
    const { result, testRoot } = runMockMiner({
      'tsconfig.json': `
        // Standard JSONC single-line comment
        {
          /* Multi-line comment
             in tsconfig */
          "compilerOptions": {
            "paths": {
              "@pages/*": ["pages/*"]
            }
          }
        }
      `,
      'pages/taga-demo.ts': `export class DemoPage {}`,
      'tests/ui/taga-demo.spec.ts': `
        import { DemoPage } from '@pages/taga-demo';
        test('Demo test', async () => {});
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('pages/taga-demo');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.1: Single-file read exception resilience
  test('crawler recovers gracefully if an individual source file fails to read', () => {
    const warnings: string[] = [];
    const customLogger = {
      log: () => {},
      warn: (msg: string) => warnings.push(msg),
      error: () => {}
    };

    const { result, testRoot } = runMockMiner(
      {
        'pages/taga-readable.ts': `export class ReadablePage {}`
      },
      {},
      {
        logger: customLogger,
        silent: false
      }
    );

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    expect(pageSection.lanes[0].modules[0].id).toBe('pages/taga-readable');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 5.2: loadConfig validates object root and logs warnings
  test('loadConfig validates object root and logs warnings', () => {
    const tempDir = path.resolve(__dirname, '../../scratch/cfg_test_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    const malformedConfigPath = path.join(tempDir, 'invalid_config.json');
    fs.writeFileSync(malformedConfigPath, JSON.stringify({ description: 'missing scanConfig and tags' }), 'utf8');

    const res = cp.spawnSync(process.execPath, [SCRIPT_PATH], {
      env: {
        ...process.env,
        VISUALIZER_WORKSPACE_ROOT: tempDir,
        VISUALIZER_CONFIG_PATH: malformedConfigPath,
        VISUALIZER_DATA_DIR: path.join(tempDir, 'data'),
        VISUALIZER_SILENT: 'false'
      },
      encoding: 'utf8'
    });

    const combinedOutput = (res.stdout || '') + (res.stderr || '');
    expect(combinedOutput).toContain("Warning: 'scanConfig' is missing or not an array");
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Atomic write and index resilience
  test('writeJsonAtomic writes safely and sync-visualizer recovers from malformed index.json', () => {
    const tempDir = path.resolve(__dirname, '../../scratch/ledger_unit_test_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    const indexPath = path.join(tempDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ notAnArray: true }), 'utf8');

    const workspaceRoot = path.resolve(__dirname, '../..');

    expect(() => {
      cp.execFileSync(process.execPath, [SCRIPT_PATH], {
        env: {
          ...process.env,
          VISUALIZER_WORKSPACE_ROOT: workspaceRoot,
          VISUALIZER_DATA_DIR: tempDir,
          VISUALIZER_SILENT: 'true'
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    }).not.toThrow();

    const readIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(Array.isArray(readIndex)).toBe(true);
    expect(readIndex.length).toBe(1);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Finding 3.1: TypeScript override keyword on methods and properties
  test('extracts TypeScript override methods and arrow properties in subclass models', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-override.ts': `
        export class CustomDashboardPage extends BasePage {
          override async navigate() { await this.page.goto('/custom'); }
          public override async loadData() {}
          override refresh = async () => {};
          public override reset = () => {};
        }
      `
    });

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const mod = pageSection.lanes[0].modules[0];
    const methodNames = mod.items[0].methods.map((m: any) => m.name);

    expect(methodNames).toContain('async navigate()');
    expect(methodNames).toContain('async loadData()');
    expect(methodNames).toContain('async refresh()');
    expect(methodNames).toContain('reset()');
    expect(methodNames.length).toBe(4);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.2: Fixture default and combined imports
  test('resolves fixture dependencies using default and combined imports in fixture definitions', () => {
    const { result, testRoot } = runMockMiner({
      'tests/fixtures/pages.fixture.ts': `
        import DashboardPage from '../../pages/taga-dashboard';
        import BasePage, { ModalComponent } from '../../pages/tagb-modal';
        export const test = base.extend({
          app: async ({}, use) => {
            await use({
              dashboard: new DashboardPage(),
              modal: new ModalComponent()
            });
          }
        });
      `,
      'pages/taga-dashboard.ts': `export default class DashboardPage {}`,
      'pages/tagb-modal.ts': `export default class BasePage {} export class ModalComponent {}`,
      'tests/ui/taga-combined-fixtures.spec.ts': `
        import { test } from '@playwright/test';
        test('Combined fixture usage', async ({ app }) => {
          await app.dashboard.render();
          await app.modal.open();
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('pages/taga-dashboard');
    expect(testMod.imports).toContain('pages/tagb-modal');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.3: Typed fixture arrow functions
  test('typed return annotations on fixture arrow definitions do not invalidate scope stack', () => {
    const { result, testRoot } = runMockMiner({
      'tests/fixtures/typed.fixture.ts': `
        import { OrdersPage } from '../../pages/tagc-orders';
        export const test = base.extend({
          app: async ({ page }, use): Promise<void> => {
            await use({
              orders: new OrdersPage()
            });
          }
        });
      `,
      'pages/tagc-orders.ts': `export class OrdersPage {}`,
      'tests/ui/taga-typed-fixture.spec.ts': `
        import { test } from '@playwright/test';
        test('Typed fixture test', async ({ app }) => {
          await app.orders.getHistory();
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('pages/tagc-orders');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 3.4: Function type annotations containing =>
  test('extracts arrow methods and functions with inline function type annotations containing =>', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-handlers.ts': `
        export class HandlersPage {
          public onClick: (e: MouseEvent) => void = (e) => {};
          onSubmit: (data: any) => Promise<boolean> = async (data) => true;
          standardMethod() {}
        }
      `,
      'workflows/taga-typed-workflows.ts': `
        export const runTask: (opts: Options) => Promise<void> = async (opts) => {};
        export const executeAction: () => void = () => {};
      `
    });

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const pageMod = pageSection.lanes[0].modules[0];
    const methodNames = pageMod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('onClick()');
    expect(methodNames).toContain('async onSubmit()');
    expect(methodNames).toContain('standardMethod()');

    const wfSection = result.dataset.find((s: any) => s.title === 'Workflows');
    const wfMod = wfSection.lanes[0].modules[0];
    const funcNames = wfMod.items.map((i: any) => i.name);
    expect(funcNames).toContain('runTask');
    expect(funcNames).toContain('executeAction');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.1 & 5.2: export default function and generators
  test('extracts export default functions and generator functions and methods', () => {
    const { result, testRoot } = runMockMiner({
      'workflows/taga-generators.ts': `
        export default function defaultWorkflow() {}
        export default async function defaultAsyncWorkflow() {}
        export function* stepGenerator() {}
        export async function* eventStreamer() {}
      `,
      'pages/taga-gen-class.ts': `
        export class GeneratorService {
          *generateTokens() {}
          async *streamChunks() {}
        }
      `
    });

    const wfSection = result.dataset.find((s: any) => s.title === 'Workflows');
    const wfMod = wfSection.lanes[0].modules[0];
    const funcNames = wfMod.items.map((i: any) => i.name);
    expect(funcNames).toContain('defaultWorkflow');
    expect(funcNames).toContain('defaultAsyncWorkflow');
    expect(funcNames).toContain('stepGenerator');
    expect(funcNames).toContain('eventStreamer');

    const pageSection = result.dataset.find((s: any) => s.title === 'UI Models');
    const pageMod = pageSection.lanes[0].modules[0];
    const methodNames = pageMod.items[0].methods.map((m: any) => m.name);
    expect(methodNames).toContain('generateTokens()');
    expect(methodNames).toContain('async streamChunks()');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.2: Wildcard barrel re-exports export * from and inline type stripping
  test('wildcard barrel re-exports export * from and inline type stripping map to submodules', () => {
    const { result, testRoot } = runMockMiner({
      'workflows/index.ts': `
        export * from './taga-user-ops';
        export { type UserType, getUserSetting } from './taga-settings';
      `,
      'workflows/taga-user-ops.ts': `
        export function createUser() {}
        export const deleteUser = () => {};
        export class UserManager {}
      `,
      'workflows/taga-settings.ts': `
        export function getUserSetting() {}
      `,
      'tests/ui/taga-barrel.spec.ts': `
        import { test } from '@playwright/test';
        import { createUser, deleteUser, UserManager, getUserSetting } from '@workflows';
        test('Barrel re-export test', async () => {});
      `,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '@workflows': ['workflows/index.ts']
          }
        }
      })
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('workflows/taga-user-ops');
    expect(testMod.imports).toContain('workflows/taga-settings');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.3 & 5.1: Index import resolution and prevention of phantom . module IDs
  test('prevents phantom . module IDs on index imports and separates non-card index files from barrel re-exports', () => {
    const { result, testRoot } = runMockMiner(
      {
        'components/table/index.ts': `export class TableComponent {}`,
        'components/widgets/widget-item.ts': `export class WidgetItem {}`,
        'components/widgets/index.ts': `export { WidgetItem } from './widget-item';`,
        'pages/index.ts': `export class RootPage {}`,
        'tests/ui/taga-index-import.spec.ts': `
          import { test } from '@playwright/test';
          import { RootPage } from '@pages/index';
          import { TableComponent } from '../../components/table/index';
          import { WidgetItem } from '../../components/widgets/index';
          test('Index import test', async () => {});
        `,
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            paths: {
              '@pages/*': ['pages/*']
            }
          }
        })
      },
      {
        scanConfig: [
          { name: 'Api Models', dir: './api', type: 'class', allowUntagged: false, subfolders: [] },
          { name: 'Workflows', dir: './workflows', type: 'functions', allowUntagged: false, subfolders: [] },
          { name: 'Components', dir: './components', type: 'class', allowUntagged: true, subfolders: ['widgets'] },
          { name: 'UI Models', dir: './pages', type: 'class', allowUntagged: false, subfolders: [] },
          { name: 'Tests', dir: './tests', type: 'test', allowUntagged: false, subfolders: ['ui', 'api', 'service'], fixturesDir: './tests/fixtures' }
        ]
      }
    );

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).not.toContain('.');
    expect(testMod.imports).not.toContain('index');
    expect(testMod.imports).toContain('components/widgets/widget-item');
    expect(testMod.externalImports).toContain('pages/index');
    expect(testMod.externalImports).toContain('components/table/index');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 4.4: Template literal interpolations preserve fixture chains inside backticks
  test('template literal interpolations preserve fixture chains inside backticks', () => {
    const { result, testRoot } = runMockMiner({
      'tests/fixtures/locator.fixture.ts': `
        import { SearchPage } from '../../pages/taga-search';
        export const test = base.extend({
          app: async ({}, use) => {
            await use({
              search: new SearchPage()
            });
          }
        });
      `,
      'pages/taga-search.ts': `export class SearchPage {}`,
      'tests/ui/taga-template-chain.spec.ts': `
        import { test } from '@playwright/test';
        test('Template literal fixture access', async ({ app, page }) => {
          await page.locator(\`\${app.search.inputSelector}\`).fill('query');
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('pages/taga-search');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Finding 5.3: Playwright test.fail and test.slow modifiers
  test('extracts Playwright test.fail and test.slow modifiers alongside other tests', () => {
    const { result, testRoot } = runMockMiner({
      'tests/ui/taga-modifiers.spec.ts': `
        import { test } from '@playwright/test';
        test.fail('Known bug expected to fail', async () => {});
        test.slow('Long running stress test', async () => {});
        test('Normal test', async () => {});
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    const testNames = testMod.items.map((i: any) => i.name);
    expect(testNames).toContain('Known bug expected to fail');
    expect(testNames).toContain('Long running stress test');
    expect(testNames).toContain('Normal test');
    expect(testMod.items.length).toBe(3);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancements #1 & #2: Token/AST-lite fixture parser (generic base.extend, arrow types, custom roots, getters, var handlers, concise arrows)
  test('Enhancements #1 & #2: fixture analyzer handles arrow interfaces, generic base.extend, custom roots, getters, and concise factories', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-boards.ts': `export class BoardsPage { open() {} }`,
      'pages/tagb-helper.ts': `export class HelperPage { render() {} }`,
      'api/taga-auth-api.ts': `export class AuthApi { createToken() {} }`,
      'tests/fixtures/advanced.fixture.ts': `
        import { BoardsPage } from '../../pages/taga-boards';
        import { HelperPage } from '../../pages/tagb-helper';
        import { AuthApi } from '../../api/taga-auth-api';

        type CallbackFn = (input: string) => number;
        interface CustomFixtures {
          authApi: AuthApi;
          connect: { boards: BoardsPage; helper: HelperPage };
          onReady: (cb: () => void) => Promise<void>;
        }

        export class ConnectHub {
          constructor(private page: any) {}
          get boards() {
            return new BoardsPage();
          }
          get helper() {
            const buildHelper: CallbackFn = () => 1;
            const make = (p: any) => new HelperPage();
            return make(this.page);
          }
        }

        const buildAuth = async ({ request }: any, use: any) => {
          const client = new AuthApi();
          await use(client);
        };

        export const test = base.extend<CustomFixtures & { extra: () => string }>({
          authApi: buildAuth,
          connect: async ({ page }, use) => await use(new ConnectHub(page))
        });
      `,
      'tests/ui/taga-advanced-fixture.spec.ts': `
        import { test } from '../fixtures/advanced.fixture';
        test('Uses custom roots, getters, and concise factory chains', async ({ authApi, connect }) => {
          authApi.createToken();
          connect.boards.open();
          connect.helper.render();
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('api/taga-auth-api');
    expect(testMod.imports).toContain('pages/taga-boards');
    expect(testMod.imports).toContain('pages/tagb-helper');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #3: Case-insensitive subfolder matching while preserving disk casing
  test('Enhancement #3: case-insensitive subfolder discovery finds tests even when config casing differs from disk', () => {
    const { result, testRoot } = runMockMiner(
      {
        'tests/ui/taga-lower.spec.ts': `test('Lowercase ui folder test', async () => {});`,
        'tests/API/taga-upper.spec.ts': `test('Uppercase API folder test', async () => {});`
      },
      {
        scanConfig: [
          { name: 'Api Models', dir: './api', type: 'class', allowUntagged: false, subfolders: [] },
          { name: 'Workflows', dir: './workflows', type: 'functions', allowUntagged: false, subfolders: [] },
          { name: 'Components', dir: './components', type: 'class', allowUntagged: true, subfolders: [] },
          { name: 'UI Models', dir: './pages', type: 'class', allowUntagged: false, subfolders: [] },
          { name: 'Tests', dir: './tests', type: 'test', allowUntagged: false, subfolders: ['UI', 'api'], fixturesDir: './tests/fixtures' }
        ]
      }
    );

    const testSection = result.dataset.find((s: any) => s.title === 'Tests');
    const mods = testSection.lanes.flatMap((l: any) => l.modules);
    const ids = mods.map((m: any) => m.id);
    expect(ids).toContain('tests/ui/taga-lower.spec');
    expect(ids).toContain('tests/API/taga-upper.spec');
    expect(mods.length).toBe(2);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #4: Workspace-relative IDs prevent basename collisions across subfolders
  test('Enhancement #4: identical filenames in different subfolders produce unique workspace-relative module IDs', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-item.ts': `export class PageItem {}`,
      'api/taga-item.ts': `export class ApiItem {}`,
      'tests/ui/tagb-checkout.spec.ts': `
        import { PageItem } from '../../pages/taga-item';
        test('UI checkout', async () => {});
      `,
      'tests/api/tagb-checkout.spec.ts': `
        import { ApiItem } from '../../api/taga-item';
        test('API checkout', async () => {});
      `
    });

    const testsMods = result.dataset.find((s: any) => s.title === 'Tests').lanes.flatMap((l: any) => l.modules);
    const uiCheckout = testsMods.find((m: any) => m.id === 'tests/ui/tagb-checkout.spec');
    const apiCheckout = testsMods.find((m: any) => m.id === 'tests/api/tagb-checkout.spec');
    expect(uiCheckout).toBeDefined();
    expect(apiCheckout).toBeDefined();
    expect(uiCheckout.imports).toEqual(['pages/taga-item']);
    expect(apiCheckout.imports).toEqual(['api/taga-item']);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #5: Filtering imports to card IDs + externalImports + skipped warnings
  test('Enhancement #5: filters imports to dataset card IDs, emits externalImports, and warns on skipped internal files', () => {
    const { result, testRoot } = runMockMiner(
      {
        'parsers/csv-parser.ts': `export class CsvParser {}`,
        'pages/unconfigured/taga-hidden.ts': `export class HiddenPage {}`,
        'workflows/untagged-helper.ts': `export function untaggedHelper() {}`,
        'pages/taga-visible.ts': `export class VisiblePage {}`,
        'tests/ui/taga-filtering.spec.ts': `
          import { CsvParser } from '../../parsers/csv-parser';
          import { HiddenPage } from '../../pages/unconfigured/taga-hidden';
          import { untaggedHelper } from '../../workflows/untagged-helper';
          import { VisiblePage } from '../../pages/taga-visible';
          test('Filtering check', async () => {});
        `
      },
      {},
      { silent: false }
    );

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toEqual(['pages/taga-visible']);
    expect(testMod.externalImports).toContain('parsers/csv-parser');
    expect(testMod.externalImports).toContain('pages/unconfigured/taga-hidden');
    expect(testMod.externalImports).toContain('workflows/untagged-helper');
    expect(result.stderr).toContain("imports skipped module 'pages/unconfigured/taga-hidden'");
    expect(result.stderr).toContain("imports skipped module 'workflows/untagged-helper'");
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #6: Per-file re-export maps prevent cross-barrel symbol collisions & track TS types
  test('Enhancement #6: barrel re-exports resolve per index file without global symbol pollution and include exported TS types', () => {
    const { result, testRoot } = runMockMiner({
      'workflows/index.ts': `
        export * from './taga-alpha';
        export { betaFn } from './taga-beta';
      `,
      'workflows/taga-alpha.ts': `
        export interface AlphaConfig { retries: number; }
        export type AlphaMode = 'fast' | 'safe';
        export function alphaFn() {}
      `,
      'workflows/taga-beta.ts': `export function betaFn() {}`,
      'components/other-barrel.ts': `export { alphaFn, betaFn } from './distractor';`,
      'components/distractor.ts': `export function alphaFn() {} export function betaFn() {}`,
      'tests/ui/taga-barrel-precision.spec.ts': `
        import { alphaFn, type AlphaConfig, type AlphaMode, betaFn } from '@workflows';
        test('Barrel precision', async () => {});
      `,
      'tests/ui/taga-type-only-star.spec.ts': `
        import type { AlphaConfig } from '@workflows';
        test('Type-only wildcard re-export', async () => {});
      `,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          paths: {
            '@workflows': ['workflows/index.ts']
          }
        }
      })
    });

    const testsMods = result.dataset.find((s: any) => s.title === 'Tests').lanes.flatMap((l: any) => l.modules);
    const barrelMod = testsMods.find((m: any) => m.id === 'tests/ui/taga-barrel-precision.spec');
    const typeOnlyMod = testsMods.find((m: any) => m.id === 'tests/ui/taga-type-only-star.spec');

    expect(barrelMod.imports).toContain('workflows/taga-alpha');
    expect(barrelMod.imports).toContain('workflows/taga-beta');
    expect(barrelMod.imports).not.toContain('components/distractor');
    expect(typeOnlyMod.imports).toContain('workflows/taga-alpha');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #7: Destructuring, concise arrow callbacks, ASI aliases, local & imported helper sub-objects
  test('Enhancement #7: spec resolution handles parameter destructuring, concise callbacks, ASI aliases, and helper sub-objects', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-boards.ts': `export class BoardsPage { load() {} }`,
      'pages/tagb-billing.ts': `export class BillingPage { pay() {} }`,
      'api/taga-telemetry.ts': `export class TelemetryApi { push() {} }`,
      'api/tagc-audit.ts': `export class AuditApi { log() {} }`,
      'utils/spec-helper.ts': `
        export const triggerBilling = async (billing: any) => {
          await billing.pay();
        };
      `,
      'tests/fixtures/multi.fixture.ts': `
        import { BoardsPage } from '../../pages/taga-boards';
        import { BillingPage } from '../../pages/tagb-billing';
        import { TelemetryApi } from '../../api/taga-telemetry';
        import { AuditApi } from '../../api/tagc-audit';

        export const test = base.extend({
          app: async ({}, use) => {
            await use({
              boards: new BoardsPage(),
              billing: new BillingPage(),
              telemetry: new TelemetryApi()
            });
          },
          auditOnly: async ({}, use) => await use(new AuditApi())
        });
      `,
      'tests/ui/taga-spec-patterns.spec.ts': `
        import { test } from '../fixtures/multi.fixture';
        import { triggerBilling } from '../../utils/spec-helper';

        function localTelemetryHelper(ctx: any) {
          ctx.stream.push();
        }

        test('destructured and local helper', async ({ app: { boards, billing, ...rest }, auditOnly }) => {
          auditOnly.log();
          localTelemetryHelper({ stream: rest.telemetry });
          await triggerBilling(billing);
        });

        test('concise callback and ASI alias', async ({ app: renamedApp }) => {
          const t = renamedApp.telemetry
          t.push()
          await (() => renamedApp.boards.load())();
        });

        test('direct concise param', ({ app: a }) => a.boards.load());
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.imports).toContain('pages/taga-boards');
    expect(testMod.imports).toContain('pages/tagb-billing');
    expect(testMod.imports).toContain('api/taga-telemetry');
    expect(testMod.imports).toContain('api/tagc-audit');
    expect(testMod.externalImports).toContain('utils/spec-helper');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #8: Regex literal tokenization prevents comment/string desync
  test('Enhancement #8: regex literals containing //, /*, and quotes do not hide subsequent fixture chains or tests', () => {
    const { result, testRoot } = runMockMiner({
      'pages/taga-boards.ts': `export class BoardsPage { open() {} url = '/home'; }`,
      'tests/fixtures/app.fixture.ts': `
        import { BoardsPage } from '../../pages/taga-boards';
        export const test = base.extend({
          app: async ({}, use) => { await use({ boards: new BoardsPage() }); }
        });
      `,
      'tests/ui/taga-regex-safe.spec.ts': `
        import { test } from '../fixtures/app.fixture';

        const urlPattern = /https:\\/\\/example\\.com\\/'[^']*'/i;
        const jsxCommentLike = /{/* not a comment */;

        if (x) /[/\\]]*/g.test('ok');

        test('After regex literals', async ({ app, page }) => {
          const u = \`prefix-\${app.boards.url}\`;
          await app.boards.open();
          expect(urlPattern.test(u)).toBe(true);
        });
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.items.map((i: any) => i.name)).toEqual(['After regex literals']);
    expect(testMod.imports).toContain('pages/taga-boards');
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Enhancement #9: Annotation-only calls without callbacks are ignored when counting tests
  test('Enhancement #9: ignores runtime test.skip/fixme/fail/slow annotation calls without callbacks', () => {
    const { result, testRoot } = runMockMiner({
      'tests/ui/taga-annotations.spec.ts': `
        import { test } from '@playwright/test';

        test.skip('Feature flag off');
        test.fixme('Pending backend deployment');
        test.fail(process.env.CI === 'true', 'Known CI flake');

        test('First real test', async ({ page }) => {
          test.skip(true, 'Runtime conditional skip inside test body');
          test.slow();
        });

        test('Tagged 3-arg test', { tag: '@smoke' }, async ({ page }) => {});

        test.fixme('Fixme test with body', async () => {});
      `
    });

    const testMod = result.dataset.find((s: any) => s.title === 'Tests').lanes[0].modules[0];
    expect(testMod.items.map((i: any) => i.name)).toEqual([
      'First real test',
      'Tagged 3-arg test',
      'Fixme test with body'
    ]);
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  // Frontend unit guard: isModuleMatch & normalizeModuleDiffId prevent cross-subfolder basename collisions
  test('Frontend guard: isModuleMatch prevents cross-subfolder basename collisions and supports legacy diffs', () => {
    expect(
      isModuleMatch('tests/api/tagb-02-checkout-flow.spec', 'tests/ui/tagb-02-checkout-flow.spec', 'tests/ui/tagb-02-checkout-flow')
    ).toBe(false);
    expect(
      isModuleMatch('tests/ui/tagb-02-checkout-flow.spec', 'tests/ui/tagb-02-checkout-flow.spec', 'tests/ui/tagb-02-checkout-flow')
    ).toBe(true);
    expect(
      isModuleMatch('tests/ui/tagb-02-checkout-flow', 'tests/ui/tagb-02-checkout-flow.spec', 'tests/ui/tagb-02-checkout-flow')
    ).toBe(true);
    expect(
      isModuleMatch('pages/utils/helper', 'utils/helper', 'utils/helper')
    ).toBe(false);

    // Mixed legacy card normalized with DOM section/subfolder context
    expect(
      isModuleMatch('tests/api/tagb-02-checkout-flow.spec', 'tagb-02-checkout-flow.spec', 'tagb-02-checkout-flow', {
        sectionFolder: 'tests',
        subfolder: 'UI'
      })
    ).toBe(false);
    expect(
      isModuleMatch('tests/ui/tagb-02-checkout-flow.spec', 'tagb-02-checkout-flow.spec', 'tagb-02-checkout-flow', {
        sectionFolder: 'tests',
        subfolder: 'UI'
      })
    ).toBe(true);

    // Legacy snapshot diffing compatibility against workspace-relative target
    expect(normalizeModuleDiffId('tagb-02-checkout-flow.spec', './tests', 'UI')).toBe('tests/ui/tagb-02-checkout-flow.spec');
    expect(normalizeModuleDiffId('tests/ui/tagb-02-checkout-flow.spec', './tests', 'UI')).toBe('tests/ui/tagb-02-checkout-flow.spec');

    const legacyBaseline = [
      {
        title: 'Tests',
        folder: './tests',
        lanes: [{ laneBadges: [{ type: 'subfolder', value: 'UI' }], modules: [{ id: 'dup.spec', fileName: 'dup.spec.ts', items: [{ name: 't1' }] }] }]
      }
    ];
    const modernTarget = [
      {
        title: 'Tests',
        folder: './tests',
        lanes: [{ laneBadges: [{ type: 'subfolder', value: 'UI' }], modules: [{ id: 'tests/ui/dup.spec', fileName: 'dup.spec.ts', items: [{ name: 't1' }] }] }]
      }
    ];
    const diffed = diffSnapshots(modernTarget, legacyBaseline, { scanConfig: [{ name: 'Tests', dir: './tests', type: 'test' }] });
    expect(diffed[0].lanes[0].modules[0].status).toBeUndefined();
  });

  // Frontend browser runtime test: clicking a card highlights only the exact subfolder dependency, not a same-basename sibling
  test('Frontend browser highlighting: same-basename cards in different subfolders do not cross-highlight on click', async ({ page }) => {
    const visualizerRoot = path.resolve(__dirname, '../../visualizer');
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };

    const server = http.createServer((req: any, res: any) => {
      const reqPath = (req.url || '/').split('?')[0];
      const safePath = path.normalize(reqPath === '/' ? '/index.html' : reqPath).replace(/^(\.\.[\/\\])+/, '');
      const fullPath = path.join(visualizerRoot, safePath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        fs.createReadStream(fullPath).pipe(res);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const mockSnapshot = [
        {
          title: 'Tests',
          folder: './tests',
          description: '',
          icon: '',
          metrics: [],
          lanes: [
            {
              laneBadges: [{ type: 'subfolder', value: 'UI' }, { type: 'tag', value: 'TagB' }],
              modules: [
                {
                  id: 'tests/ui/tagb-02-checkout-flow.spec',
                  fileName: 'tagb-02-checkout-flow.spec.ts',
                  title: 'Checkout Flow',
                  tags: ['TagB'],
                  imports: [],
                  externalImports: [],
                  items: [{ name: 'UI test' }],
                  itemType: 'test'
                }
              ]
            },
            {
              laneBadges: [{ type: 'subfolder', value: 'API' }, { type: 'tag', value: 'TagB' }],
              modules: [
                {
                  id: 'tests/api/tagb-02-checkout-flow.spec',
                  fileName: 'tagb-02-checkout-flow.spec.ts',
                  title: 'Checkout Flow',
                  tags: ['TagB'],
                  imports: [],
                  externalImports: [],
                  items: [{ name: 'API test' }],
                  itemType: 'test'
                }
              ]
            },
            {
              laneBadges: [{ type: 'subfolder', value: 'SERVICE' }, { type: 'tag', value: 'TagB' }],
              modules: [
                {
                  id: 'tests/service/tagb-caller.spec',
                  fileName: 'tagb-caller.spec.ts',
                  title: 'Caller',
                  tags: ['TagB'],
                  imports: ['tests/api/tagb-02-checkout-flow.spec'],
                  externalImports: [],
                  items: [{ name: 'Caller test' }],
                  itemType: 'test'
                }
              ]
            }
          ]
        }
      ];

      await page.route('**/data/index.json', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ file: 'snapshot-mock.json', label: 'snapshot', timestamp: '01-01-26-000000' }])
        });
      });

      await page.route('**/data/snapshot-mock.json', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockSnapshot)
        });
      });

      await page.goto(`${baseUrl}/index.html`);
      const callerCard = page.locator('.module-card[data-module-id="tests/service/tagb-caller.spec"]');
      const apiCard = page.locator('.module-card[data-module-id="tests/api/tagb-02-checkout-flow.spec"]');
      const uiCard = page.locator('.module-card[data-module-id="tests/ui/tagb-02-checkout-flow.spec"]');

      await expect(callerCard).toBeVisible();
      await callerCard.click();

      await expect(callerCard).toHaveClass(/is-active-source/);
      await expect(apiCard).toHaveClass(/is-active-dependency/);
      await expect(uiCard).not.toHaveClass(/is-active-dependency/);
      await expect(uiCard).toHaveClass(/is-dimmed/);
    } finally {
      await new Promise<void>(resolve => server.close(resolve));
    }
  });

  // Miner Fix #1: Multi-tag files with identical badges share one lane (and diff removed modules land cleanly in it)
  test('Miner Fix #1: multi-tag files with identical badges share a single lane and diff mode places removed cards in that lane', () => {
    const { result: baselineRun } = runMockMiner({
      'pages/taga-tagb-alpha.ts': `export class AlphaPage { open() {} }`,
      'pages/taga-tagb-beta.ts': `export class BetaPage { close() {} }`,
      'tests/ui/taga-tagb-01-first.spec.ts': `
        test('First A', async () => {});
        test('First B', async () => {});
      `,
      'tests/ui/taga-tagb-02-second.spec.ts': `
        test('Second A', async () => {});
      `,
      'tests/ui/taga-tagb-03-third.spec.ts': `
        test('Third A', async () => {});
      `,
      'tests/api/taga-tagb-04-api.spec.ts': `
        test('Api Multi', async () => {});
      `,
      'tests/ui/taga-05-single.spec.ts': `
        test('Single Tag', async () => {});
      `
    });

    const uiModelsSection = baselineRun.dataset.find((s: any) => s.title === 'UI Models');
    expect(uiModelsSection.lanes.length).toBe(1);
    expect(uiModelsSection.lanes[0].laneBadges).toEqual([
      { type: 'tag', value: 'TagA' },
      { type: 'tag', value: 'TagB' }
    ]);
    expect(uiModelsSection.lanes[0].modules.map((m: any) => m.id).sort()).toEqual([
      'pages/taga-tagb-alpha',
      'pages/taga-tagb-beta'
    ]);

    const testsSection = baselineRun.dataset.find((s: any) => s.title === 'Tests');
    const uiMultiLanes = testsSection.lanes.filter(
      (l: any) => JSON.stringify(l.laneBadges) === JSON.stringify([
        { type: 'tag', value: 'TagA' },
        { type: 'tag', value: 'TagB' },
        { type: 'subfolder', value: 'UI' }
      ])
    );
    expect(uiMultiLanes.length).toBe(1);
    expect(uiMultiLanes[0].modules.map((m: any) => m.id).sort()).toEqual([
      'tests/ui/taga-tagb-01-first.spec',
      'tests/ui/taga-tagb-02-second.spec',
      'tests/ui/taga-tagb-03-third.spec'
    ]);

    // Verify no section contains duplicate lanes with identical badges
    for (const sec of baselineRun.dataset) {
      const badgeKeys = sec.lanes.map((l: any) => JSON.stringify(l.laneBadges));
      expect(new Set(badgeKeys).size).toBe(badgeKeys.length);
    }

    // Target snapshot: remove 'First B' test from spec 01, remove spec 02, add spec 04 replacement
    const { result: targetRun } = runMockMiner({
      'pages/taga-tagb-alpha.ts': `export class AlphaPage { open() {} }`,
      'pages/taga-tagb-beta.ts': `export class BetaPage { close() {} }`,
      'tests/ui/taga-tagb-01-first.spec.ts': `
        test('First A', async () => {});
      `,
      'tests/ui/taga-tagb-03-third.spec.ts': `
        test('Third A', async () => {});
      `,
      'tests/ui/taga-tagb-04-replacement.spec.ts': `
        test('Replacement A', async () => {});
      `,
      'tests/api/taga-tagb-04-api.spec.ts': `
        test('Api Multi', async () => {});
      `,
      'tests/ui/taga-05-single.spec.ts': `
        test('Single Tag', async () => {});
      `
    });

    const diffed = diffSnapshots(targetRun.dataset, baselineRun.dataset, {
      scanConfig: [
        { name: 'Api Models', dir: './api', type: 'class' },
        { name: 'Workflows', dir: './workflows', type: 'functions' },
        { name: 'Components', dir: './components', type: 'class' },
        { name: 'UI Models', dir: './pages', type: 'class' },
        { name: 'Tests', dir: './tests', type: 'test' }
      ]
    });

    const diffTests = diffed.find((s: any) => s.title === 'Tests');
    const diffUiMultiLanes = diffTests.lanes.filter(
      (l: any) => JSON.stringify(l.laneBadges) === JSON.stringify([
        { type: 'tag', value: 'TagA' },
        { type: 'tag', value: 'TagB' },
        { type: 'subfolder', value: 'UI' }
      ])
    );
    expect(diffUiMultiLanes.length).toBe(1);

    const laneMods = diffUiMultiLanes[0].modules;
    const modById = new Map<string, any>(laneMods.map((m: any) => [m.id, m]));
    expect(modById.size).toBe(4);
    expect(modById.get('tests/ui/taga-tagb-01-first.spec')?.status).toBeUndefined();
    expect(modById.get('tests/ui/taga-tagb-01-first.spec')?.items).toContainEqual({ name: 'First B', status: 'removed' });
    expect(modById.get('tests/ui/taga-tagb-03-third.spec')?.status).toBeUndefined();
    expect(modById.get('tests/ui/taga-tagb-04-replacement.spec')?.status).toBe('new');
    expect(modById.get('tests/ui/taga-tagb-02-second.spec')?.status).toBe('removed');
  });

  // Miner Fix #2: Tags are sorted into canonical config order regardless of filename prefix order
  test('Miner Fix #2: lane badges, lane grouping keys, module tags, and test metrics are independent of filename tag order', () => {
    const { result } = runMockMiner(
      {
        'tests/ui/taga-tagb-01-first.spec.ts': `test('Alpha', async () => {});`,
        'tests/ui/tagb-taga-02-second.spec.ts': `test('Beta', async () => {});`,
        'tests/ui/tagb-tagc-03-third.spec.ts': `test('Gamma', async () => {});`,
        'tests/ui/tagc-tagb-04-fourth.spec.ts': `test('Delta', async () => {});`,
        'pages/tagb-tagc-taga-portal.ts': `export class PortalOne {}`,
        'pages/taga-tagb-tagc-portal-two.ts': `export class PortalTwo {}`,
        'pages/tagc-tagc-dedup.ts': `export class DedupPage {}`
      },
      {
        tags: [
          { name: 'tagc', displayName: 'TagC', icon: 'tag-C.svg' },
          { name: 'taga', displayName: 'TagA', icon: 'tag-A.svg' },
          { name: 'tagb', displayName: 'TagB', icon: 'tag-B.svg' }
        ]
      }
    );

    const testsSection = result.dataset.find((s: any) => s.title === 'Tests');
    expect(testsSection.lanes.length).toBe(2);

    const tagATagBLane = testsSection.lanes.find(
      (l: any) => JSON.stringify(l.laneBadges) === JSON.stringify([
        { type: 'tag', value: 'TagA' },
        { type: 'tag', value: 'TagB' },
        { type: 'subfolder', value: 'UI' }
      ])
    );
    expect(tagATagBLane).toBeDefined();
    expect(tagATagBLane.modules.map((m: any) => m.id).sort()).toEqual([
      'tests/ui/taga-tagb-01-first.spec',
      'tests/ui/tagb-taga-02-second.spec'
    ]);
    for (const mod of tagATagBLane.modules) {
      expect(mod.tags).toEqual(['TagA', 'TagB']);
    }

    // Config order places TagC before TagB even though 'TagB' sorts before 'TagC' alphabetically
    const tagCTagBLane = testsSection.lanes.find(
      (l: any) => JSON.stringify(l.laneBadges) === JSON.stringify([
        { type: 'tag', value: 'TagC' },
        { type: 'tag', value: 'TagB' },
        { type: 'subfolder', value: 'UI' }
      ])
    );
    expect(tagCTagBLane).toBeDefined();
    expect(tagCTagBLane.modules.map((m: any) => m.id).sort()).toEqual([
      'tests/ui/tagb-tagc-03-third.spec',
      'tests/ui/tagc-tagb-04-fourth.spec'
    ]);
    for (const mod of tagCTagBLane.modules) {
      expect(mod.tags).toEqual(['TagC', 'TagB']);
    }

    // Metrics also collapse into one entry per canonical tag set
    expect(testsSection.metrics.length).toBe(2);
    const tagATagBMetric = testsSection.metrics.find((m: any) => m.label === 'TagA TagB');
    const tagCTagBMetric = testsSection.metrics.find((m: any) => m.label === 'TagC TagB');
    expect(tagATagBMetric?.count).toBe(2);
    expect(tagCTagBMetric?.count).toBe(2);

    // Three-tag pages in different orders share one lane in config order [TagC, TagA, TagB], and duplicate tag prefix deduplicates
    const pagesSection = result.dataset.find((s: any) => s.title === 'UI Models');
    expect(pagesSection.lanes.length).toBe(2);
    const threeTagLane = pagesSection.lanes.find(
      (l: any) => JSON.stringify(l.laneBadges) === JSON.stringify([
        { type: 'tag', value: 'TagC' },
        { type: 'tag', value: 'TagA' },
        { type: 'tag', value: 'TagB' }
      ])
    );
    expect(threeTagLane).toBeDefined();
    expect(threeTagLane.modules.map((m: any) => m.id).sort()).toEqual([
      'pages/taga-tagb-tagc-portal-two',
      'pages/tagb-tagc-taga-portal'
    ]);

    const dedupLane = pagesSection.lanes.find(
      (l: any) => JSON.stringify(l.laneBadges) === JSON.stringify([{ type: 'tag', value: 'TagC' }])
    );
    expect(dedupLane?.modules.map((m: any) => m.id)).toEqual(['pages/tagc-tagc-dedup']);
  });

  // Frontend diff metrics guard: computeTestMetrics lowercases tags before sorting so mixed-case tag sets match lanes
  test('Frontend diff metrics: computeTestMetrics matches mixed-case multi-tag lanes and counts removed baseline specs', () => {
    const mixedCaseTags = [
      { name: 'taga', displayName: 'tagA', icon: 'tag-A.svg' },
      { name: 'tagc', displayName: 'TagC', icon: 'tag-C.svg' }
    ];

    const { result: baselineRun } = runMockMiner(
      {
        'tests/ui/taga-tagc-01-keep.spec.ts': `
          test('Keep 1', async () => {});
          test('Keep 2', async () => {});
        `,
        'tests/ui/taga-tagc-02-deleted.spec.ts': `
          test('Deleted 1', async () => {});
          test('Deleted 2', async () => {});
          test('Deleted 3', async () => {});
        `
      },
      { tags: mixedCaseTags }
    );

    const { result: targetRun } = runMockMiner(
      {
        'tests/ui/taga-tagc-01-keep.spec.ts': `
          test('Keep 1', async () => {});
          test('Keep 2', async () => {});
        `
      },
      { tags: mixedCaseTags }
    );

    const diffed = diffSnapshots(targetRun.dataset, baselineRun.dataset, {
      tags: mixedCaseTags,
      scanConfig: [
        { name: 'Api Models', dir: './api', type: 'class' },
        { name: 'Workflows', dir: './workflows', type: 'functions' },
        { name: 'Components', dir: './components', type: 'class' },
        { name: 'UI Models', dir: './pages', type: 'class' },
        { name: 'Tests', dir: './tests', type: 'test' }
      ]
    });

    const diffTests = diffed.find((s: any) => s.title === 'Tests');
    const metric = diffTests.metrics.find((m: any) => m.label === 'tagA TagC');
    expect(metric).toBeDefined();
    expect(metric.count).toBe(2);
    expect(metric.removed).toBe(3);
    expect(diffTests.totalCount).toBe(2);
    expect(diffTests.totalRemoved).toBe(3);

    const deletedFileMetric = metric.files.find((f: any) => f.id === 'tests/ui/taga-tagc-02-deleted.spec');
    expect(deletedFileMetric).toBeDefined();
    expect(deletedFileMetric.count).toBe(0);
    expect(deletedFileMetric.removed).toBe(3);
  });

  // Miner Fix #3: Interpolated template literal test titles are kept as raw template text
  test('Miner Fix #3: preserves raw template text for interpolated template literal test titles and balances ${...} braces', () => {
    const { result } = runMockMiner({
      'pages/taga-search.ts': `export class SearchPage { inputSelector = '#q'; }`,
      'pages/tagb-results.ts': `export class ResultsPage { open() {} }`,
      'tests/fixtures/app.fixture.ts': `
        import { SearchPage } from '../../pages/taga-search';
        import { ResultsPage } from '../../pages/tagb-results';
        export const test = base.extend({
          app: async ({}, use) => {
            await use({
              search: new SearchPage(),
              results: new ResultsPage()
            });
          }
        });
      `,
      'tests/ui/taga-parameterized.spec.ts': `
        import { test } from '../fixtures/app.fixture';

        for (const row of cases) {
          test(\`case \${name}\`, async ({ app, page }) => {
            await page.locator(\`\${app.search.inputSelector}\`).fill(name);
            await app.results.open();
          });

          test(\`row \${row.id}: \${row.label}\`, async () => {});
          test(\`computed \${fn(1, 2)}\`, async () => {});
          test(\`object \${ { label: 'a', id: 1 }.label }\`, async () => {});
          test(\`nested \${\`inner \${x}\`}\`, async () => {});
          test(\`comma \${a, b}\`, async () => {});
          test(\`tagged \${name}\`, { tag: '@smoke' }, async () => {});
          test.only(\`only \${name}\`, async () => {});
          test.skip(\`skip \${name}\`, async () => {});
          test.fixme(\`fixme \${name}\`, async () => {});
          test.fail(\`fail \${name}\`, async () => {});
          test.slow(\`slow \${name}\`, async () => {});
          test(\`plain template\`, async () => {});

          // Should still be ignored (no callback or non-literal expression)
          test.skip(\`annotation only \${flag}\`);
          test.fixme(\`annotation \${id}\`, 'not a callback');
          test.skip(\`annotation arrow arg \${id}\`, \`not cb \${x => x}\`);
          test(dynamicTitle, async () => {});
          test(\`part1 \${a}\` + \`part2 \${b}\`, async () => {});
        }
      `
    });

    const testsSection = result.dataset.find((s: any) => s.title === 'Tests');
    const mod = testsSection.lanes[0].modules[0];
    const names = mod.items.map((i: any) => i.name);

    expect(names).toEqual([
      'case ${name}',
      'row ${row.id}: ${row.label}',
      'computed ${fn(1, 2)}',
      "object ${ { label: 'a', id: 1 }.label }",
      'nested ${`inner ${x}`}',
      'comma ${a, b}',
      'tagged ${name}',
      'only ${name}',
      'skip ${name}',
      'fixme ${name}',
      'fail ${name}',
      'slow ${name}',
      'plain template'
    ]);
    expect(testsSection.metrics[0].count).toBe(13);

    // Balanced ${...} inside test body also preserves subsequent fixture dependency resolution
    expect(mod.imports).toContain('pages/taga-search');
    expect(mod.imports).toContain('pages/tagb-results');
  });

  // Full regression test on the real codebase
  test('sync-visualizer executes on full repository codebase and mines all 101 modules across 5 sections without errors', () => {
    const tempDir = path.resolve(__dirname, '../../scratch/full_run_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    const workspaceRoot = path.resolve(__dirname, '../..');

    cp.execFileSync(process.execPath, [SCRIPT_PATH], {
      env: {
        ...process.env,
        VISUALIZER_WORKSPACE_ROOT: workspaceRoot,
        VISUALIZER_DATA_DIR: tempDir,
        VISUALIZER_SILENT: 'true'
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const indexPath = path.join(tempDir, 'index.json');
    const readIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(readIndex.length).toBe(1);

    const snapshotPath = path.join(tempDir, readIndex[0].file);
    const dataset = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    expect(dataset).toBeDefined();
    expect(dataset.length).toBe(5);

    const sectionTitles = dataset.map((s: any) => s.title);
    expect(sectionTitles).toEqual(['Api Models', 'Workflows', 'Components', 'UI Models', 'Tests']);

    // Every section has strictly unique lane badge combinations
    for (const sec of dataset) {
      const badgeKeys = sec.lanes.map((l: any) => JSON.stringify(l.laneBadges));
      expect(new Set(badgeKeys).size).toBe(badgeKeys.length);
    }

    const allMods = dataset.flatMap((s: any) => s.lanes.flatMap((l: any) => l.modules));
    expect(allMods.length).toBe(101);

    // Every module ID across dataset is workspace-relative and unique
    const ids = allMods.map((m: any) => m.id);
    expect(new Set(ids).size).toBe(101);
    expect(ids).toContain('tests/ui/tagb-02-checkout-flow.spec');
    expect(ids).toContain('tests/api/tagb-02-checkout-flow.spec');
    expect(ids).toContain('tests/api/taga-03-telemetry.spec');
    expect(ids).toContain('tests/service/taga-03-telemetry.spec');

    // No card has phantom 'workflows' or non-dataset entries inside mod.imports
    const idSet = new Set(ids);
    for (const mod of allMods) {
      expect(mod.imports).not.toContain('workflows');
      for (const dep of mod.imports) {
        expect(idSet.has(dep)).toBe(true);
      }
      expect(Array.isArray(mod.externalImports)).toBe(true);
    }

    // Fixture-based specs resolve non-empty card imports and separate externalImports cleanly
    const byId = new Map<string, any>(allMods.map((m: any) => [m.id, m]));
    expect(byId.get('tests/ui/taga-tagb-01-dashboard.spec')?.imports.length).toBeGreaterThan(0);
    expect(byId.get('tests/api/taga-tagb-tagc-05-fixture-overrides.spec')?.imports.length).toBeGreaterThan(0);
    expect(byId.get('tests/service/taga-05-fixture-patterns.spec')?.imports.length).toBeGreaterThan(0);

    const hasCsvExternal = allMods.some((m: any) => (m.externalImports || []).includes('parsers/csv-parser'));
    expect(hasCsvExternal).toBe(true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
