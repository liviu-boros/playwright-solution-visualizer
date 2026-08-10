import { test } from '@playwright/test';
import { MetricsApi } from '@api/taga-metrics-api';
import { fetchExportProgress, collectSystemMetrics } from '@workflows';
import { TelemetryPanelPage } from '@pages/taga-telemetry-panel';
import { WidgetsViewPage } from '@pages/taga-widgets-view';
import { AnalyticsPage } from '@pages/taga-analytics';

test('Service > Webhooks > Validate Webhook Signature', async ({ page }) => {
  const metrics = new MetricsApi(page);
  const telemetry = new TelemetryPanelPage(page);
  const widgets = new WidgetsViewPage(page);
  const analytics = new AnalyticsPage(page);
  await fetchExportProgress();
  await collectSystemMetrics();
});

test('Service > Webhooks > HMAC SHA256 Signature Verification', async ({ page }) => {});
test('Service > Webhooks > Exponential Backoff Retry Policy', async ({ page }) => {});
