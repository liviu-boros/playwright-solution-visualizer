import { test } from '@playwright/test';
import { SettingsApi } from '@api/tagc-settings-api';
import { purgeInactiveSessions, auditUserPermissions } from '@workflows';
import { SessionManagerPage } from '@pages/tagc-session-manager';
import { UserProfilePage } from '@pages/tagc-user-profile';
import { SecurityAuditPage } from '@pages/tagc-security-audit';

test('API > Session > Validate Auth Token Lifecycle', async ({ page }) => {
  const settings = new SettingsApi(page);
  const manager = new SessionManagerPage(page);
  const profile = new UserProfilePage(page);
  const audit = new SecurityAuditPage(page);
  await purgeInactiveSessions();
  await auditUserPermissions();
});

test('API > Session > Refresh OAuth2 Access Token', async ({ page }) => {});
test('API > Session > Revoke Active JWT Bearer Token', async ({ page }) => {});
test('API > Session > Validate Concurrent Session Limits', async ({ page }) => {});
