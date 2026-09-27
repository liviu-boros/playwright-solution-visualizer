import { test, expect } from '../fixtures/taga.fixture';

test('UI > Widgets > Render Chart Widget', async ({ tagaPages, tagaApi }) => {
  await tagaApi.metrics.getSystemMetrics();
  await tagaPages.analytics.viewSystemMetrics();
  await tagaPages.boards.createNewBoard();
  await tagaPages.dashboard.renderDashboardGrid();
  await tagaPages.widgetsView.configureWidgets();
});

test('UI > Widgets > Drag and Drop Cards', async ({ page }) => {});
test('UI > Widgets > Filter Widget Data Stream', async ({ page }) => {});
test('UI > Widgets > Export Widget Snapshot as PDF', async ({ page }) => {});
test('UI > Widgets > Refresh Realtime Analytics Grid', async ({ page }) => {});
