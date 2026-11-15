import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdown, parseInline } from '../../visualizer/js/presentation-notes.js';

test.describe('Presentation Notes Module & Markdown Parser', () => {
  const notesDir = path.resolve(__dirname, '../../visualizer/notes');
  const sprintMdPath = path.join(notesDir, 'sprint.md');
  const flowSvgPath = path.join(notesDir, 'images/flow-diagram.svg');
  const metricsSvgPath = path.join(notesDir, 'images/metrics-preview.svg');
  const cssPath = path.resolve(__dirname, '../../visualizer/css/components/presentation-card.css');

  test('file structure setup: sprint.md and SVG images exist', () => {
    expect(fs.existsSync(sprintMdPath)).toBe(true);
    expect(fs.existsSync(flowSvgPath)).toBe(true);
    expect(fs.existsSync(metricsSvgPath)).toBe(true);
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  test('sample SVG images: correct viewBox dimensions and content', () => {
    const flowSvg = fs.readFileSync(flowSvgPath, 'utf8');
    expect(flowSvg).toContain('viewBox="0 0 480 160"');
    expect(flowSvg).toContain('Checkout Service');
    expect(flowSvg).toContain('Payment Gateway');

    const metricsSvg = fs.readFileSync(metricsSvgPath, 'utf8');
    expect(metricsSvg).toContain('viewBox="0 0 480 140"');
    expect(metricsSvg).toContain('Token Authorization');
    expect(metricsSvg).toContain('Fraud Inspection Hook');
    expect(metricsSvg).toContain('Transaction Commit');
  });

  test('CSS component: defines .presentation-card, content-based sizing, and min-width token', () => {
    const css = fs.readFileSync(cssPath, 'utf8');
    expect(css).toContain('--presentation-card-min-width');
    expect(css).toContain('.presentation-card');
    expect(css).toContain('width: max-content');
    expect(css).toContain('min-width: var(--presentation-card-min-width');
    expect(css).toContain('.presentation-heading--1');
    expect(css).toContain('.presentation-heading--2');
    expect(css).toContain('.presentation-heading--3');
    expect(css).toContain('.presentation-list');
    expect(css).toContain('.presentation-list-item');
    expect(css).toContain('.presentation-quote');
    expect(css).toContain('.presentation-code');
    expect(css).toContain('.presentation-image');
  });

  test('markdown parser: parses headings (#, ##, ###) into BEM heading classes', () => {
    const md = '# Title 1\n## Section 2\n### Subsection 3';
    const html = parseMarkdown(md);
    expect(html).toContain('<h1 class="presentation-heading presentation-heading--1">Title 1</h1>');
    expect(html).toContain('<h2 class="presentation-heading presentation-heading--2">Section 2</h2>');
    expect(html).toContain('<h3 class="presentation-heading presentation-heading--3">Subsection 3</h3>');
  });

  test('markdown parser: parses lists (*) with bold and inline code items', () => {
    const md = '* **Task A:** Refactor `app.fixture.ts`\n* **Task B:** Remove modal';
    const html = parseMarkdown(md);
    expect(html).toContain('<ul class="presentation-list">');
    expect(html).toContain('<li class="presentation-list-item"><strong class="presentation-strong">Task A:</strong> Refactor <code class="presentation-code">app.fixture.ts</code></li>');
    expect(html).toContain('<li class="presentation-list-item"><strong class="presentation-strong">Task B:</strong> Remove modal</li>');
    expect(html).toContain('</ul>');
  });

  test('markdown parser: parses blockquotes (>) into styled quote classes', () => {
    const md = '> Critical: All checkout API endpoints must resolve within 250ms';
    const html = parseMarkdown(md);
    expect(html).toContain('<blockquote class="presentation-quote">');
    expect(html).toContain('<p class="presentation-quote-text">Critical: All checkout API endpoints must resolve within 250ms</p>');
    expect(html).toContain('</blockquote>');
  });

  test('markdown parser: parses code blocks (```) and inline code with special characters', () => {
    const inlineHtml = parseInline('Latency `< 120ms` & error `0.5%`');
    expect(inlineHtml).toContain('<code class="presentation-code">&lt; 120ms</code>');
    expect(inlineHtml).toContain('&amp;');
    expect(inlineHtml).toContain('<code class="presentation-code">0.5%</code>');

    const blockMd = '```json\n{\n  "status": "ok"\n}\n```';
    const blockHtml = parseMarkdown(blockMd);
    expect(blockHtml).toContain('<pre class="presentation-pre"><code class="presentation-code-block">');
    expect(blockHtml).toContain('"status": "ok"');
  });

  test('markdown parser: parses standalone images (![alt](url)) into image wrappers', () => {
    const md = '![Payment Flow Diagram](notes/images/flow-diagram.svg)';
    const html = parseMarkdown(md);
    expect(html).toContain('<div class="presentation-image-wrapper"><img src="notes/images/flow-diagram.svg" alt="Payment Flow Diagram" class="presentation-image" /></div>');
  });

  test('markdown parser: parses complete sample sprint.md cleanly with all syntax variants', () => {
    const sprintMd = fs.readFileSync(sprintMdPath, 'utf8');
    const html = parseMarkdown(sprintMd);

    expect(html).toContain('<h1 class="presentation-heading presentation-heading--1">Sprint 42: Modernization &amp; Gateway Rollout</h1>');
    expect(html).toContain('<h2 class="presentation-heading presentation-heading--2">1. Gateway Pipeline Architecture</h2>');
    expect(html).toContain('<div class="presentation-image-wrapper"><img src="notes/images/flow-diagram.svg" alt="Payment Flow Diagram" class="presentation-image" /></div>');
    expect(html).toContain('<h2 class="presentation-heading presentation-heading--2">2. Key Scope Deliverables</h2>');
    expect(html).toContain('<strong class="presentation-strong">Refactor Core Fixtures:</strong>');
    expect(html).toContain('<code class="presentation-code">tagb.fixture.ts</code>');
    expect(html).toContain('<h2 class="presentation-heading presentation-heading--2">3. SLA &amp; Target Latency Thresholds</h2>');
    expect(html).toContain('<blockquote class="presentation-quote">');
    expect(html).toContain('<code class="presentation-code">&lt; 120ms</code>');
    expect(html).toContain('<div class="presentation-image-wrapper"><img src="notes/images/metrics-preview.svg" alt="Latency Metrics Preview" class="presentation-image" /></div>');
    expect(html).toContain('<h3 class="presentation-heading presentation-heading--3">Notes on Deployment</h3>');
  });

  test('fallback guard: empty or invalid markdown returns empty string without throwing', () => {
    expect(parseMarkdown('')).toBe('');
    expect(parseMarkdown(null as any)).toBe('');
    expect(parseMarkdown(undefined as any)).toBe('');
  });

  test('zero build pipeline impact: sync-visualizer config does not reference notes directory', () => {
    const configPath = path.resolve(__dirname, '../../visualizer/visualizer-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const directories = config.scanConfig.map((sc: any) => sc.dir);
    for (const dir of directories) {
      expect(dir).not.toContain('notes');
    }
  });

  test('zero build pipeline impact: existing snapshot files do not contain notes section', () => {
    const dataDir = path.resolve(__dirname, '../../visualizer/data');
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('snapshot-') && f.endsWith('.json'));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
      const json = JSON.parse(content);
      const sectionTitles = json.map((s: any) => (s.title || '').toLowerCase());
      expect(sectionTitles).not.toContain('presentation / sprint notes');
      expect(sectionTitles).not.toContain('presentation notes');
      expect(sectionTitles).not.toContain('sprint notes');
    }
  });
});

test.describe('Presentation Notes Browser Runtime Integration', () => {
  const http = require('http');
  const visualizerRoot = path.resolve(__dirname, '../../visualizer');
  let server: any;
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
    server = http.createServer((req: any, res: any) => {
      const reqUrl = req.url.split('?')[0];
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
        const port = server.address().port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(resolve));
    }
  });

  test('browser runtime: loads and attaches presentation notes column to canvas', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${serverUrl}/index.html`);
    await page.waitForSelector('#canvas .section-container');

    const column = page.locator('#presentationNotesColumn');
    await expect(column).toBeVisible();

    const card = page.locator('.presentation-card');
    await expect(card).toBeVisible();

    // Verify format integrity of elements inside presentation-card
    await expect(card.locator('h1.presentation-heading--1')).toContainText('Sprint 42: Modernization & Gateway Rollout');
    await expect(card.locator('h2.presentation-heading--2').first()).toContainText('1. Gateway Pipeline Architecture');
    await expect(card.locator('.presentation-image').first()).toBeVisible();
    await expect(card.locator('ul.presentation-list')).toHaveCount(2);
    await expect(card.locator('blockquote.presentation-quote')).toBeVisible();
    await expect(card.locator('code.presentation-code').first()).toBeVisible();

    expect(consoleErrors).toHaveLength(0);
  });

  test('snapshot independence: notes column remains visible across snapshot switches', async ({ page }) => {
    await page.goto(`${serverUrl}/index.html`);
    await page.waitForSelector('#presentationNotesColumn');

    // Trigger target dropdown change
    const targetTrigger = page.locator('#leftSelectContainer .custom-select-trigger');
    if (await targetTrigger.isVisible()) {
      await targetTrigger.click();
      const option = page.locator('#leftSelectContainer .custom-select-option:not(.is-disabled)').first();
      if (await option.isVisible()) {
        await option.click();
        // Wait for canvas rebuild
        await page.waitForTimeout(300);
        await expect(page.locator('#presentationNotesColumn')).toBeVisible();
        await expect(page.locator('.presentation-card')).toBeVisible();
      }
    }
  });

  test('fallback guard: visualizer renders cleanly with zero errors when sprint.md is absent', async ({ page }) => {
    const sprintPath = path.join(visualizerRoot, 'notes/sprint.md');
    const sprintBackupPath = path.join(visualizerRoot, 'notes/sprint.md.tmpbak');

    fs.renameSync(sprintPath, sprintBackupPath);

    try {
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto(`${serverUrl}/index.html`);
      await page.waitForSelector('#canvas .section-container');

      // The presentation notes column must NOT exist on canvas
      const column = page.locator('#presentationNotesColumn');
      await expect(column).toHaveCount(0);

      const card = page.locator('.presentation-card');
      await expect(card).toHaveCount(0);

      // Must have zero application console errors
      const appErrors = consoleErrors.filter(msg => !msg.includes('Failed to load resource') && !msg.includes('404'));
      expect(appErrors).toHaveLength(0);
    } finally {
      if (fs.existsSync(sprintBackupPath)) {
        fs.renameSync(sprintBackupPath, sprintPath);
      }
    }
  });
});
