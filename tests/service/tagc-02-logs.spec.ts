import { test } from '@playwright/test';
import { EndpointsApi } from '@api/tagc-endpoints';
import { cancelOptimizationJob } from '@workflows';
import { SystemLogsPage } from '@pages/tagc-system-logs';
import { SessionManagerPage } from '@pages/tagc-session-manager';
import { SettingsPage } from '@pages/tagc-settings';

test('Service > Logs > Rotate Server Event Logs', async ({ page }) => {
  const endpoints = new EndpointsApi(page);
  const logs = new SystemLogsPage(page);
  const session = new SessionManagerPage(page);
  const settings = new SettingsPage(page);
  await cancelOptimizationJob();
});

test('Service > Logs > Compress Archive Logs to AWS S3 Bucket', async ({ page }) => {});
test('Service > Logs > Stream Realtime Tail Logs over WebSocket', async ({ page }) => {});
test('Service > Logs > Parse Syslog Severity Filter Levels', async ({ page }) => {});
