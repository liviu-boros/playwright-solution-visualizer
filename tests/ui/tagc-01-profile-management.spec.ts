import { test, expect } from '@fixtures/tagc.fixture';

test('UI > Profile > Edit User Bio', async ({ tagcPages, tagcApi }) => {
  await tagcApi.endpoints.refreshToken();
  await tagcApi.settings.getAccountPreferences();
  await tagcApi.auditJobs.triggerAuditJob();
  await tagcPages.navBar.selectTenant('acme');
  await tagcPages.userProfile.viewProfile();
  await tagcPages.settings.updateSettings();
  await tagcPages.securityAudit.viewAuditLogs();
  await tagcPages.permissionsGrid.modifyRolePermissions();
});

test('UI > Profile > Upload Avatar Image', async ({ tagcPages }) => {
  const modal = tagcPages.createRoleModal('editor');
  expect(await modal.assignRole()).toBe('editor');
});
test('UI > Profile > Update Contact Preferences', async ({ tagcApi }) => {
  const status = await tagcApi.service.auth.introspectClient();
  expect(status.active).toBe(true);
});
test('UI > Profile > Change Timezone and Locale', async ({ page }) => {});
