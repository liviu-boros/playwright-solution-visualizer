import { test as base, expect } from '@playwright/test';
// Api Models
import { MetricsApi } from '../../api/taga-metrics-api';
import { TelemetryApi } from '../../api/taga-telemetry-api';
import { V1DeprecatedApi } from '../../api/taga-v1-deprecated-api';
import { GatewayRouterApi } from '../../api/taga-tagb-gateway-router';
// Pages
import { AnalyticsPage } from '../../pages/taga-analytics';
import { BoardsPage } from '../../pages/taga-boards';
import { DashboardPage } from '../../pages/taga-dashboard';
import { NotificationsCenterPage } from '../../pages/taga-notifications-center';
import { ReportsPage } from '../../pages/taga-reports';
import { TelemetryPanelPage } from '../../pages/taga-telemetry-panel';
import { WidgetsViewPage } from '../../pages/taga-widgets-view';
import { LegacyPortalPage } from '../../pages/taga-legacy-portal';

export type TagAPages = {
  analytics: AnalyticsPage;
  boards: BoardsPage;
  dashboard: DashboardPage;
  notificationsCenter: NotificationsCenterPage;
  reports: ReportsPage;
  telemetryPanel: TelemetryPanelPage;
  widgetsView: WidgetsViewPage;
  legacyPortal: LegacyPortalPage;
};

export type TagAApi = {
  metrics: MetricsApi;
  telemetry: TelemetryApi;
  v1Deprecated: V1DeprecatedApi;
  gatewayRouter: GatewayRouterApi;
};

export const test = base.extend<{ tagaPages: TagAPages; tagaApi: TagAApi }>({
  tagaPages: async ({ page }, use) => {
    await use({
      analytics: new AnalyticsPage(page),
      boards: new BoardsPage(page),
      dashboard: new DashboardPage(page),
      notificationsCenter: new NotificationsCenterPage(page),
      reports: new ReportsPage(page),
      telemetryPanel: new TelemetryPanelPage(page),
      widgetsView: new WidgetsViewPage(page),
      legacyPortal: new LegacyPortalPage(page),
    });
  },
  tagaApi: async ({ request }, use) => {
    await use({
      metrics: new MetricsApi(request),
      telemetry: new TelemetryApi(request),
      v1Deprecated: new V1DeprecatedApi(request),
      gatewayRouter: new GatewayRouterApi(request),
    });
  },
});

export { expect };
