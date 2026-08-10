import { test } from '@playwright/test';
import { TelemetryApi } from '@api/taga-telemetry-api';
import { MetricsApi } from '@api/taga-metrics-api';
import { collectSystemMetrics, dispatchEmailAlert } from '@workflows';
import { TelemetryPanelPage } from '@pages/taga-telemetry-panel';
import { NotificationsCenterPage } from '@pages/taga-notifications-center';
import { AnalyticsPage } from '@pages/taga-analytics';

test('API > Telemetry > Stream Log Payloads', async ({ page }) => {
  const telemetry = new TelemetryApi(page);
  const metrics = new MetricsApi(page);
  const panel = new TelemetryPanelPage(page);
  const notify = new NotificationsCenterPage(page);
  const analytics = new AnalyticsPage(page);
  await collectSystemMetrics();
  await dispatchEmailAlert();
});

test('API > Telemetry > OpenTelemetry Trace ID Propagation', async ({ page }) => {});
test('API > Telemetry > Batch Send Span Batches to Collector', async ({ page }) => {});
test('API > Telemetry > Verify Jaeger Tracing Metadata', async ({ page }) => {});
test('API > Telemetry > Flush Buffer on Process Terminate', async ({ page }) => {});
