import { test, expect } from '@fixtures/taga.fixture';

test('Service > TagA > Fixture Exposes Handler Models And Factories', async ({ tagaPages, tagaApi }) => {
  expect(tagaPages.tagaWeb).toBe('https://taga.example.test');
  expect(tagaApi.handler.authScheme).toBe('Bearer');

  const parsed = tagaPages.createCsvParser(',').parse('id,name\n1,board');
  expect(parsed).toEqual([{ id: '1', name: 'board' }]);

  const modal = tagaPages.createExportModal('xlsx');
  expect(await modal.selectExportFormat()).toBe('xlsx');

  await tagaPages.navBar.openProfileMenu();
  await tagaPages.navDrawer.collapseDrawer();
  await tagaApi.exportSettings.updateExportSettings('json');

  const streams = await tagaApi.service.telemetry.getStreams();
  expect(streams.authScheme).toBe('Basic');
});

test.describe('Overridden TagA subscriptions', () => {
  test.use({
    tagaSubscriptions: {
      api: 'custom-taga-service-sub',
    },
  });

  test('Service > TagA > Option Fixture Overrides Subscription Id', async ({ tagaApi }) => {
    expect(tagaApi.subscriptionId).toBe('custom-taga-service-sub');
    expect(tagaApi.subscriptions.api).toBe('custom-taga-service-sub');
    const settings = await tagaApi.exportSettings.getExportSettings();
    expect(settings.subscriptionId).toBe('custom-taga-service-sub');
  });
});
