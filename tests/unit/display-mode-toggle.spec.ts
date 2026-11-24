import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { filterSectionsForDisplayMode } from '../../visualizer/js/app.js';

test.describe('Display Mode Toggle Unit & Architecture Checks', () => {
  const visualizerRoot = path.resolve(__dirname, '../../visualizer');
  const buttonJsPath = path.join(visualizerRoot, 'js/components/ButtonComponent.js');
  const buttonToggleJsPath = path.join(visualizerRoot, 'js/components/ButtonToggleComponent.js');
  const buttonCssPath = path.join(visualizerRoot, 'css/components/button-component.css');
  const buttonToggleCssPath = path.join(visualizerRoot, 'css/components/button-toggle-component.css');
  const controlPanelCssPath = path.join(visualizerRoot, 'css/components/control-panel.css');
  const variablesCssPath = path.join(visualizerRoot, 'css/variables.css');
  const stylesCssPath = path.join(visualizerRoot, 'css/styles.css');

  test('component files and CSS imports follow visualizer component architecture', () => {
    expect(fs.existsSync(buttonJsPath)).toBe(true);
    expect(fs.existsSync(buttonToggleJsPath)).toBe(true);
    expect(fs.existsSync(buttonCssPath)).toBe(true);
    expect(fs.existsSync(buttonToggleCssPath)).toBe(true);

    const stylesCss = fs.readFileSync(stylesCssPath, 'utf8');
    expect(stylesCss).toContain("@import url('components/button-component.css');");
    expect(stylesCss).toContain("@import url('components/button-toggle-component.css');");

    // Enforce 4-tier token architecture: no global Tier 5 component variables in variables.css
    const variablesCss = fs.readFileSync(variablesCssPath, 'utf8');
    expect(variablesCss).not.toMatch(/--(btn|toggle|select|panel-label|compare-badge)-/);

    const controlPanelCss = fs.readFileSync(controlPanelCssPath, 'utf8');
    expect(controlPanelCss).toContain('.panel-separator');
    expect(controlPanelCss).toContain('.panel-toggle-wrapper');

    // Enforce direct Tier 2-4 token usage and zero CSS transitions per PRD Section 5
    const buttonCss = fs.readFileSync(buttonCssPath, 'utf8');
    const toggleCss = fs.readFileSync(buttonToggleCssPath, 'utf8');
    expect(buttonCss).toContain('var(--font-size-subtitle)');
    expect(buttonCss).toContain('var(--color-bg-surface-dark)');
    expect(buttonCss).toContain('var(--color-text-accent)');
    expect(toggleCss).toContain('var(--color-bg-surface-dark)');
    expect(toggleCss).toContain('var(--color-border-input)');
    expect(buttonCss).not.toMatch(/\btransition\s*:/);
    expect(toggleCss).not.toMatch(/\btransition\s*:/);
  });

  test('filterSectionsForDisplayMode returns all sections in complex mode and only test sections in simple mode', () => {
    const config = {
      scanConfig: [
        { name: 'Api Models', dir: './api', type: 'class' },
        { name: 'Workflows', dir: './workflows', type: 'functions' },
        { name: 'Components', dir: './components', type: 'class' },
        { name: 'UI Models', dir: './pages', type: 'class' },
        { name: 'Custom QA Specs', dir: './specs', type: 'test' }
      ]
    };

    const dataset = [
      { title: 'Api Models', folder: './api', lanes: [] },
      { title: 'Workflows', folder: './workflows', lanes: [] },
      { title: 'Components', folder: './components', lanes: [] },
      { title: 'UI Models', folder: './pages', lanes: [] },
      { title: 'Custom QA Specs', folder: './specs', lanes: [] }
    ];

    expect(filterSectionsForDisplayMode(dataset, config, 'complex')).toHaveLength(5);

    const simpleSections = filterSectionsForDisplayMode(dataset, config, 'simple');
    expect(simpleSections).toHaveLength(1);
    expect(simpleSections[0].title).toBe('Custom QA Specs');
  });

  test('filterSectionsForDisplayMode handles title fallback and invalid inputs safely', () => {
    const legacyDataset = [
      { title: 'Pages', folder: './pages', lanes: [] },
      { title: 'Tests', folder: './tests', lanes: [] }
    ];

    const simpleSections = filterSectionsForDisplayMode(legacyDataset, null, 'simple');
    expect(simpleSections).toHaveLength(1);
    expect(simpleSections[0].title).toBe('Tests');

    expect(filterSectionsForDisplayMode(null as any, null, 'simple')).toEqual([]);
    expect(filterSectionsForDisplayMode([], null, 'complex')).toEqual([]);
  });
});

test.describe('Display Mode Toggle Browser Runtime Integration', () => {
  const visualizerRoot = path.resolve(__dirname, '../../visualizer');
  let server: http.Server;
  let serverUrl: string;

  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.md': 'text/markdown',
    '.png': 'image/png'
  };

  test.beforeAll(async () => {
    server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      const reqUrl = (req.url || '/').split('?')[0];
      if (reqUrl === '/notes/sprint.md') {
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end('# Sprint Notes\n\n* Isolated test fixture notes\n');
        return;
      }

      const filePath = path.join(visualizerRoot, reqUrl === '/' ? 'index.html' : reqUrl);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('control panel displays separator and segmented Complex/Simple toggle after diff selects', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${serverUrl}/index.html`);
    await page.waitForSelector('#canvas .section-container');

    const childOrder = await page.locator('#controlPanel > *').evaluateAll(els =>
      els.map(el => el.className)
    );
    expect(childOrder).toEqual([
      'panel-select-wrapper',
      'panel-compare-badge',
      'panel-select-wrapper',
      'panel-separator',
      'panel-toggle-wrapper'
    ]);

    const complexBtn = page.locator('#displayModeToggle button[data-value="complex"]');
    const simpleBtn = page.locator('#displayModeToggle button[data-value="simple"]');

    await expect(complexBtn).toBeVisible();
    await expect(simpleBtn).toBeVisible();
    await expect(complexBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(complexBtn).toHaveClass(/btn--active/);
    await expect(simpleBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(simpleBtn).not.toHaveClass(/btn--active/);

    // Default Complex mode renders all 5 sections + Sprint Notes
    const sectionTitles = await page.locator('#canvas .section-container').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section'))
    );
    expect(sectionTitles).toEqual(['Api Models', 'Workflows', 'Components', 'UI Models', 'Tests']);
    await expect(page.locator('#presentationNotesColumn')).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });

  test('toggling to Simple hides non-Tests sections, keeps Sprint Notes, clears highlights, and resets pan', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${serverUrl}/index.html`);
    await page.waitForSelector('#canvas .section-container');

    // Click a Tests card in Complex mode so dependency curves are drawn
    const firstTestCard = page.locator('#canvas .section-container[data-section="Tests"] .module-card').first();
    await firstTestCard.click({ force: true });
    await expect(page.locator('#canvas .is-active-source')).toHaveCount(1);

    // Pan the canvas away from initial (100, 100)
    await page.mouse.move(400, 400);
    await page.mouse.down();
    await page.mouse.move(150, 250);
    await page.mouse.up();

    const pannedTransform = await page.locator('#canvas').evaluate(el => el.style.transform);
    expect(pannedTransform).not.toContain('translate(100px, 100px)');

    // Toggle to Simple mode
    const simpleBtn = page.locator('#displayModeToggle button[data-value="simple"]');
    const complexBtn = page.locator('#displayModeToggle button[data-value="complex"]');
    await simpleBtn.click();

    await expect(simpleBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(simpleBtn).toHaveClass(/btn--active/);
    await expect(complexBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(complexBtn).not.toHaveClass(/btn--active/);

    // Only Tests section should remain among section containers
    const visibleSections = await page.locator('#canvas .section-container').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section'))
    );
    expect(visibleSections).toEqual(['Tests']);

    // Sprint Notes stays visible alongside Tests
    await expect(page.locator('#presentationNotesColumn')).toBeVisible();

    // Previous dependency highlights & SVG paths must be cleared
    await expect(page.locator('#canvas .is-active-source')).toHaveCount(0);
    await expect(page.locator('#connectionsLayer path')).toHaveCount(0);

    // Canvas pan must be reset to initial (100px, 100px)
    const resetTransform = await page.locator('#canvas').evaluate(el => el.style.transform);
    expect(resetTransform).toContain('translate(100px, 100px)');

    // Clicking a Tests card in Simple mode highlights cleanly without stray paths to hidden sections
    const simpleTestCard = page.locator('#canvas .section-container[data-section="Tests"] .module-card').first();
    await simpleTestCard.click({ force: true });
    await expect(page.locator('#canvas .is-active-source')).toHaveCount(1);
    await expect(page.locator('#connectionsLayer path')).toHaveCount(0);

    // Switch back to Complex mode
    await complexBtn.click();
    const restoredSections = await page.locator('#canvas .section-container').evaluateAll(els =>
      els.map(el => el.getAttribute('data-section'))
    );
    expect(restoredSections).toEqual(['Api Models', 'Workflows', 'Components', 'UI Models', 'Tests']);
    await expect(page.locator('#presentationNotesColumn')).toBeVisible();
    await expect(page.locator('#canvas .is-active-source')).toHaveCount(0);

    expect(consoleErrors).toHaveLength(0);
  });

  test('Simple mode persists across snapshot timeline switches', async ({ page }) => {
    await page.goto(`${serverUrl}/index.html`);
    await page.waitForSelector('#canvas .section-container');

    // Switch to Simple mode
    await page.locator('#displayModeToggle button[data-value="simple"]').click();
    await expect(page.locator('#canvas .section-container')).toHaveCount(1);

    // Change Target snapshot dropdown to another non-disabled option
    await page.locator('#leftSelectContainer .custom-select-trigger').click();
    const alternateOption = page.locator('#leftSelectContainer .custom-select-option:not(.is-disabled):not(.is-selected)').first();
    if (await alternateOption.isVisible()) {
      await alternateOption.click();
      await page.waitForTimeout(300);

      const sectionsAfterSwitch = await page.locator('#canvas .section-container').evaluateAll(els =>
        els.map(el => el.getAttribute('data-section'))
      );
      expect(sectionsAfterSwitch).toEqual(['Tests']);
      await expect(page.locator('#presentationNotesColumn')).toBeVisible();
      await expect(page.locator('#displayModeToggle button[data-value="simple"]')).toHaveAttribute('aria-pressed', 'true');
    }
  });
});
