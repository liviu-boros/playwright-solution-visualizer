import { test, expect } from '@fixtures/tagb.fixture';

test('Service > TagB > Fixture Exposes Handler Table Settings And Factories', async ({ tagbPages, tagbApi }) => {
  expect(tagbPages.tagbWeb).toBe('https://tagb.example.test');
  expect(tagbApi.tagbApiWithoutSubscription).toContain('/public');
  expect(tagbApi.handler.authScheme).toBe('Bearer');

  const modal = tagbPages.createEditOrderModal('GBP');
  const note = await modal.updateOrderNotes('Expedite');
  expect(note).toEqual({ currency: 'GBP', notes: 'Expedite' });

  const layout = await tagbApi.tableSettings.getColumnLayout();
  expect(layout.columns).toContain('amount');

  const invoices = await tagbApi.service.billing.getInvoices();
  expect(invoices.authScheme).toBe('Basic');
});

test.describe('Overridden TagB subscriptions', () => {
  test.use({
    tagbSubscriptions: {
      api: 'custom-tagb-billing-sub',
    },
  });

  test('Service > TagB > Option Fixture Overrides Subscription Id', async ({ tagbApi }) => {
    expect(tagbApi.subscriptionId).toBe('custom-tagb-billing-sub');
    const layout = await tagbApi.tableSettings.getColumnLayout();
    expect(layout.subscriptionId).toBe('custom-tagb-billing-sub');
  });
});
