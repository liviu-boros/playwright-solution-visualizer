import { test } from '@playwright/test';
import { MetricsApi } from '@api/taga-metrics-api';
import { TelemetryApi } from '@api/taga-telemetry-api';
import { dispatchEmailAlert, aggregateTelemetryData } from '@workflows';
import { ReportsPage } from '@pages/taga-reports';
import { TelemetryPanelPage } from '@pages/taga-telemetry-panel';
import { NotificationsCenterPage } from '@pages/taga-notifications-center';

test('UI > Navigation > Verify Top Bar Navigation', async ({ page }) => {
  const metrics = new MetricsApi(page);
  const telemetryApi = new TelemetryApi(page);
  const reports = new ReportsPage(page);
  const telemetry = new TelemetryPanelPage(page);
  const notify = new NotificationsCenterPage(page);
  await dispatchEmailAlert();
  await aggregateTelemetryData();
});

test('UI > Navigation > Collapse Left Sidebar', async ({ page }) => {});
test('UI > Navigation > Switch Theme Mode Dark Light', async ({ page }) => {});
test('UI > Navigation > Breadcrumb Hierarchy Trail', async ({ page }) => {});
