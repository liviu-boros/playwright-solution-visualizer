import { test } from '@playwright/test';
import { MetricsApi } from '@api/taga-metrics-api';
import { aggregateTelemetryData } from '@workflows';
import { WidgetsViewPage } from '@pages/taga-widgets-view';
import { TelemetryPanelPage } from '@pages/taga-telemetry-panel';
import { BoardsPage } from '@pages/taga-boards';

test('API > Endpoints > Validate REST API Route', async ({ page }) => {
  const api = new MetricsApi(page);
  const widgets = new WidgetsViewPage(page);
  const telemetry = new TelemetryPanelPage(page);
  const boards = new BoardsPage(page);
  await aggregateTelemetryData();
});

test('API > Endpoints > Validate OpenAPI v3 Schema Spec', async ({ page }) => {});
test('API > Endpoints > Verify CORS Options Preflight Response', async ({ page }) => {});
test('API > Endpoints > Check Gzip Compression Header', async ({ page }) => {});
