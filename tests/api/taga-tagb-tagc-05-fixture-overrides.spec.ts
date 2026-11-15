import { test, expect } from '@fixtures/app.fixture';

test('API > Fixtures > Default Subscriptions And Handler Config', async ({ app }) => {
  expect(app.subscriptions.taga).toBe(app.tagaApi.subscriptionId);
  expect(app.tagaApi.handler.buildAuthHeader()).toBe('Bearer token-taga-qa');
  expect(app.tagbApi.tagbApiWithoutSubscription).toContain('/public');
  expect(app.taga.tagaWeb).toBe('https://taga.example.test');
});

test('API > Fixtures > Lazy Service Api Uses Basic Auth And Caches Instance', async ({ app }) => {
  const firstRef = app.serviceApi;
  const secondRef = app.serviceApi;
  expect(firstRef).toBe(secondRef);
  expect(firstRef.handler.authScheme).toBe('Basic');
  expect(firstRef.handler.buildAuthHeader()).toMatch(/^Basic /);

  const streams = await app.serviceApi.telemetry.getStreams();
  const invoices = await app.serviceApi.billing.getInvoices();
  const authStatus = await app.serviceApi.auth.introspectClient();

  expect(streams.authScheme).toBe('Basic');
  expect(invoices.count).toBe(3);
  expect(authStatus.active).toBe(true);
});

test('API > Fixtures > Concise Arrow Factories And Destructuring Patterns', async ({ app }) => {
  const parser = app.createCsvParser(';');
  const parsed = parser.parse('service;status\nauth;ok');
  expect(parsed).toEqual([{ service: 'auth', status: 'ok' }]);

  const exportModal = app.createExportModal('json');
  expect(await exportModal.selectExportFormat()).toBe('json');

  const { taga, tagbApi } = app;
  await taga.navDrawer.navigateToSection('Reports');
  const layout = await tagbApi.tableSettings.getColumnLayout();
  expect(layout.columns).toContain('status');
});

test.describe('Overridden API subscriptions', () => {
  test.use({
    apiSubscriptions: {
      taga: 'custom-taga-sub-999',
      tagc: 'custom-tagc-sub-888',
    },
  });

  test('API > Fixtures > Partial Subscription Overrides Merge With Defaults', async ({ app }) => {
    expect(app.tagaApi.subscriptionId).toBe('custom-taga-sub-999');
    expect(app.subscriptions.taga).toBe('custom-taga-sub-999');
    expect(app.tagcApi.subscriptionId).toBe('custom-tagc-sub-888');
    expect(app.tagbApi.subscriptionId).toBe('sub-tagb-billing-201');

    const settings = await app.tagaApi.exportSettings.getExportSettings();
    const auditJob = await app.tagcApi.auditJobs.triggerAuditJob();
    expect(settings.subscriptionId).toBe('custom-taga-sub-999');
    expect(auditJob.subscriptionId).toBe('custom-tagc-sub-888');
  });
});
