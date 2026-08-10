import { test } from '@playwright/test';
import { SettingsApi } from '@api/tagc-settings-api';
import { purgeInactiveSessions, cancelOptimizationJob } from '@workflows';
import { SettingsPage } from '@pages/tagc-settings';
import { UserActivityPage } from '@pages/tagc-user-activity';
import { SessionManagerPage } from '@pages/tagc-session-manager';

test('UI > Settings > Update Theme Preference', async ({ page }) => {
  const settings = new SettingsPage(page);
  const activity = new UserActivityPage(page);
  const session = new SessionManagerPage(page);
  const settingsApi = new SettingsApi(page);
  await purgeInactiveSessions();
  await cancelOptimizationJob();
});

test('UI > Settings > Toggle Desktop Notifications', async ({ page }) => {});
test('UI > Settings > Configure API Rate Limit Warnings', async ({ page }) => {});
