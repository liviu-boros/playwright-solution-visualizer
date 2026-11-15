import { test, expect } from '@fixtures/taga.fixture';

test('UI > Widgets > Render Chart Widget', async ({ tagaPages, tagaApi }) => {
  await tagaApi.metrics.getSystemMetrics();
  await tagaApi.exportSettings.getExportSettings();
  await tagaPages.navBar.switchEnvironment();
  await tagaPages.navDrawer.navigateToSection('Widgets');
  await tagaPages.analytics.viewSystemMetrics();
  await tagaPages.boards.createNewBoard();
  await tagaPages.dashboard.renderDashboardGrid();
  await tagaPages.widgetsView.configureWidgets();
});

test('UI > Widgets > Drag and Drop Cards', async ({ page }) => {});
test('UI > Widgets > Filter Widget Data Stream', async ({ tagaPages }) => {
  const rows = tagaPages.createCsvParser('|').parse('widget|visible\nchart|true');
  expect(rows).toEqual([{ widget: 'chart', visible: 'true' }]);
});
test('UI > Widgets > Export Widget Snapshot as PDF', async ({ tagaPages }) => {
  const modal = tagaPages.createExportModal('pdf');
  expect(await modal.selectExportFormat()).toBe('pdf');
});
test('UI > Widgets > Refresh Realtime Analytics Grid', async ({ tagaApi }) => {
  const streams = await tagaApi.service.telemetry.getStreams();
  expect(streams.streams).toContain('metrics-live');
});
