import { test } from '@playwright/test';
import { MetricsApi } from '@api/taga-metrics-api';
import { triggerDataExport, collectSystemMetrics } from '@workflows';
import { AnalyticsPage } from '@pages/taga-analytics';
import { BoardsPage } from '@pages/taga-boards';
import { DashboardPage } from '@pages/taga-dashboard';
import { WidgetsViewPage } from '@pages/taga-widgets-view';

test('UI > Widgets > Render Chart Widget', async ({ page }) => {
  const api = new MetricsApi(page);
  const analytics = new AnalyticsPage(page);
  const boards = new BoardsPage(page);
  const dashboard = new DashboardPage(page);
  const widgets = new WidgetsViewPage(page);
  await triggerDataExport();
  await collectSystemMetrics();
});

test('UI > Widgets > Drag and Drop Cards', async ({ page }) => {});
test('UI > Widgets > Filter Widget Data Stream', async ({ page }) => {});
test('UI > Widgets > Export Widget Snapshot as PDF', async ({ page }) => {});
test('UI > Widgets > Refresh Realtime Analytics Grid', async ({ page }) => {});
