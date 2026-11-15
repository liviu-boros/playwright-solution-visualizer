import { expect, test as base } from "@playwright/test";
import { ServiceTelemetryApi } from "@api/taga-service-telemetry-api";
import { TagAExportSettingsApi } from "@api/taga-export-settings-api";
import { MetricsApi } from "@api/taga-metrics-api";
import { GatewayRouterApi } from "@api/taga-tagb-gateway-router";
import { TelemetryApi } from "@api/taga-telemetry-api";
import { V1DeprecatedApi } from "@api/taga-v1-deprecated-api";
import { ApiHandler } from "@components/ApiHandler";
import { CsvParser } from "@parsers/csv-parser";
import { AnalyticsPage } from "@pages/taga-analytics";
import { BoardsPage } from "@pages/taga-boards";
import { DashboardPage } from "@pages/taga-dashboard";
import { TagAExportSettingsModal } from "@pages/taga-export-settings-modal";
import { LegacyPortalPage } from "@pages/taga-legacy-portal";
import { TagANavBar } from "@pages/taga-navbar-section";
import { TagANavDrawerSection } from "@pages/taga-navdrawer-section";
import { NotificationsCenterPage } from "@pages/taga-notifications-center";
import { ReportsPage } from "@pages/taga-reports";
import { TelemetryPanelPage } from "@pages/taga-telemetry-panel";
import { WidgetsViewPage } from "@pages/taga-widgets-view";
import ENV, { requireServiceBaseApiUrl, requireServiceCredentials, resolveTestEnv } from "@utils/testEnv";
import { getAccessTokenForOrigin } from "@workflows/workflows-token";

type TagASubscriptions = {
  api: string;
  primary: string;
  secondary: string;
  legacy: string;
};

type TagAApiSubscriptions = {
  api: string;
};

type TagASubscriptionOverrides = Partial<TagAApiSubscriptions>;

const defaultTagASubscriptions: TagAApiSubscriptions = {
  api: ENV.ENV_QA_SUBSCRIPTION_ID,
};

type ServiceTagAApiModels = {
  serviceApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  telemetry: ServiceTelemetryApi;
};

export type TagAPages = {
  tagaWeb: string;
  createCsvParser: (delimiter?: string) => CsvParser;
  createExportModal: (defaultFormat?: string) => TagAExportSettingsModal;
  analytics: AnalyticsPage;
  boards: BoardsPage;
  dashboard: DashboardPage;
  exportSettingsModal: TagAExportSettingsModal;
  legacyPortal: LegacyPortalPage;
  navBar: TagANavBar;
  navDrawer: TagANavDrawerSection;
  notificationsCenter: NotificationsCenterPage;
  reports: ReportsPage;
  telemetryPanel: TelemetryPanelPage;
  widgetsView: WidgetsViewPage;
};

export type TagAApi = {
  tagaApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  subscriptions: TagASubscriptions;
  exportSettings: TagAExportSettingsApi;
  metrics: MetricsApi;
  telemetry: TelemetryApi;
  v1Deprecated: V1DeprecatedApi;
  gatewayRouter: GatewayRouterApi;
  service: ServiceTagAApiModels;
};

const toOrigin = (url: string): string => (url ? new URL(url).origin : "");

export const test = base.extend<{
  tagaPages: TagAPages;
  tagaApi: TagAApi;
  tagaSubscriptions: TagASubscriptionOverrides;
}>({
  tagaSubscriptions: [
    defaultTagASubscriptions,
    { option: true },
  ],
  tagaPages: async ({ page }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);

    await use({
      tagaWeb: env.tagaBaseWebUrl,
      createCsvParser: (delimiter?: string) => new CsvParser(delimiter),
      createExportModal: (defaultFormat?: string) => new TagAExportSettingsModal(page, defaultFormat),
      analytics: new AnalyticsPage(page),
      boards: new BoardsPage(page),
      dashboard: new DashboardPage(page),
      exportSettingsModal: new TagAExportSettingsModal(page),
      legacyPortal: new LegacyPortalPage(page),
      navBar: new TagANavBar(page),
      navDrawer: new TagANavDrawerSection(page),
      notificationsCenter: new NotificationsCenterPage(page),
      reports: new ReportsPage(page),
      telemetryPanel: new TelemetryPanelPage(page),
      widgetsView: new WidgetsViewPage(page),
    });
  },
  tagaApi: async ({ request, tagaSubscriptions }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);
    const configuredSubscriptions = { ...defaultTagASubscriptions, ...tagaSubscriptions };
    const subscriptionId = configuredSubscriptions.api;

    const tagaHandler = new ApiHandler(
      request,
      env.tagaBaseApiUrl,
      getAccessTokenForOrigin(env.state, toOrigin(env.tagaBaseWebUrl)),
    );
    let serviceModels: ServiceTagAApiModels | undefined;

    await use({
      tagaApi: env.tagaBaseApiUrl,
      handler: tagaHandler,
      subscriptionId,
      subscriptions: {
        api: subscriptionId,
        primary: ENV.TAGA_PRIMARY_SUBSCRIPTION_ID,
        secondary: ENV.TAGA_SECONDARY_SUBSCRIPTION_ID,
        legacy: ENV.TAGA_LEGACY_SUBSCRIPTION_ID,
      },
      exportSettings: new TagAExportSettingsApi(tagaHandler, subscriptionId),
      metrics: new MetricsApi(tagaHandler, subscriptionId),
      telemetry: new TelemetryApi(tagaHandler, subscriptionId),
      v1Deprecated: new V1DeprecatedApi(tagaHandler, subscriptionId),
      gatewayRouter: new GatewayRouterApi(tagaHandler, subscriptionId),
      // Lazy: Service credentials are only required by tests that use service.
      get service() {
        if (!serviceModels) {
          const serviceBaseApiUrl = requireServiceBaseApiUrl(env.envName);
          const { subscriptionId: serviceSubId, basicToken } = requireServiceCredentials();
          const serviceHandler = new ApiHandler(request, serviceBaseApiUrl, basicToken, "Basic");
          serviceModels = {
            serviceApi: serviceBaseApiUrl,
            handler: serviceHandler,
            subscriptionId: serviceSubId,
            telemetry: new ServiceTelemetryApi(serviceHandler),
          };
        }
        return serviceModels;
      },
    });
  },
});

export { expect };
