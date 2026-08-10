import { test } from '@playwright/test';
import { EndpointsApi } from '@api/tagc-endpoints';
import { SettingsApi } from '@api/tagc-settings-api';
import { auditUserPermissions, triggerOptimizationJob } from '@workflows';
import { PermissionsGridPage } from '@pages/tagc-permissions-grid';
import { UserActivityPage } from '@pages/tagc-user-activity';
import { SettingsPage } from '@pages/tagc-settings';

test('API > Auth > Check User Token Roles', async ({ page }) => {
  const endpoints = new EndpointsApi(page);
  const settingsApi = new SettingsApi(page);
  const perms = new PermissionsGridPage(page);
  const activity = new UserActivityPage(page);
  const settings = new SettingsPage(page);
  await auditUserPermissions();
  await triggerOptimizationJob();
});

test('API > Auth > Enforce Multi-Factor Authentication Challenge', async ({ page }) => {});
test('API > Auth > Validate SAML 2.0 Identity Provider Response', async ({ page }) => {});
test('API > Auth > Verify Password Reset Token Hash Expiry', async ({ page }) => {});
