import { test, expect } from '@fixtures/tagc.fixture';

test('Service > TagC > Fixture Exposes Handler Audit Jobs And Factories', async ({ tagcPages, tagcApi }) => {
  expect(tagcPages.tagcWeb).toBe('https://tagc.example.test');
  expect(tagcApi.handler.authScheme).toBe('Bearer');

  const modal = tagcPages.createRoleModal('admin');
  expect(await modal.assignRole()).toBe('admin');

  const job = await tagcApi.auditJobs.triggerAuditJob();
  expect(job.jobId).toBe('audit-job-001');

  const status = await tagcApi.service.auth.introspectClient();
  expect(status.authScheme).toBe('Basic');
});

test.describe('Overridden TagC subscriptions', () => {
  test.use({
    tagcSubscriptions: {
      api: 'custom-tagc-audit-sub',
    },
  });

  test('Service > TagC > Option Fixture Overrides Subscription Id', async ({ tagcApi }) => {
    expect(tagcApi.subscriptionId).toBe('custom-tagc-audit-sub');
    const job = await tagcApi.auditJobs.triggerAuditJob();
    expect(job.subscriptionId).toBe('custom-tagc-audit-sub');
  });
});
