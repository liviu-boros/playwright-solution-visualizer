import { test } from '@playwright/test';
import { TelemetryApi } from '@api/taga-telemetry-api';
import { dispatchEmailAlert, queueSMSNotification } from '@workflows';
import { NotificationsCenterPage } from '@pages/taga-notifications-center';
import { ReportsPage } from '@pages/taga-reports';
import { BoardsPage } from '@pages/taga-boards';

test('Service > Notifications > Process Outbound Queue', async ({ page }) => {
  const telemetry = new TelemetryApi(page);
  const notify = new NotificationsCenterPage(page);
  const reports = new ReportsPage(page);
  const boards = new BoardsPage(page);
  await dispatchEmailAlert();
  await queueSMSNotification();
});

test('Service > Notifications > Retry Failed Webhook Delivery', async ({ page }) => {});
test('Service > Notifications > Validate APNS Apple Push Token', async ({ page }) => {});
test('Service > Notifications > Rate Limit Outbound Email Digest', async ({ page }) => {});
