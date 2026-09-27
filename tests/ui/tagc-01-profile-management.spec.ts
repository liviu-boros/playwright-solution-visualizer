import { test, expect } from '../fixtures/tagc.fixture';

test('UI > Profile > Edit User Bio', async ({ tagcPages, tagcApi }) => {
  await tagcApi.endpoints.refreshToken();
  await tagcApi.settings.getAccountPreferences();
  await tagcPages.userProfile.viewProfile();
  await tagcPages.settings.updateSettings();
  await tagcPages.securityAudit.viewAuditLogs();
  await tagcPages.permissionsGrid.modifyRolePermissions();
});

test('UI > Profile > Upload Avatar Image', async ({ page }) => {});
test('UI > Profile > Update Contact Preferences', async ({ page }) => {});
test('UI > Profile > Change Timezone and Locale', async ({ page }) => {});
