import { test } from '@playwright/test';
import { EndpointsApi } from '@api/tagc-endpoints';
import { SettingsApi } from '@api/tagc-settings-api';
import { triggerOptimizationJob, auditUserPermissions } from '@workflows';
import { UserProfilePage } from '@pages/tagc-user-profile';
import { SettingsPage } from '@pages/tagc-settings';
import { SecurityAuditPage } from '@pages/tagc-security-audit';
import { PermissionsGridPage } from '@pages/tagc-permissions-grid';

test('UI > Profile > Edit User Bio', async ({ page }) => {
  const profile = new UserProfilePage(page);
  const settings = new SettingsPage(page);
  const audit = new SecurityAuditPage(page);
  const perms = new PermissionsGridPage(page);
  const endpoints = new EndpointsApi(page);
  const settingsApi = new SettingsApi(page);
  await triggerOptimizationJob();
  await auditUserPermissions();
});

test('UI > Profile > Upload Avatar Image', async ({ page }) => {});
test('UI > Profile > Update Contact Preferences', async ({ page }) => {});
test('UI > Profile > Change Timezone and Locale', async ({ page }) => {});
