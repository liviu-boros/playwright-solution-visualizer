import { expect, Page, test as base } from "@playwright/test";
import { ServiceTelemetryApi } from "@api/taga-service-telemetry-api";
import { TagAExportSettingsApi } from "@api/taga-export-settings-api";
import { MetricsApi } from "@api/taga-metrics-api";
import { GatewayRouterApi } from "@api/taga-tagb-gateway-router";
import { TelemetryApi } from "@api/taga-telemetry-api";
import { V1DeprecatedApi } from "@api/taga-v1-deprecated-api";
import { ServiceBillingApi } from "@api/tagb-service-billing-api";
import { LegacyPaymentsApi } from "@api/tagb-legacy-payments-api";
import { PaymentGatewayApi } from "@api/tagb-payment-gateway";
import { SubscriptionApi } from "@api/tagb-subscription-api";
import { TagBTableSettingsApi } from "@api/tagb-table-settings-api";
import { TagCAuditJobsApi } from "@api/tagc-audit-jobs-api";
import { ServiceAuthApi } from "@api/tagc-service-auth-api";
import { AuthEndpoints } from "@api/tagc-endpoints";
import { SettingsApi } from "@api/tagc-settings-api";
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
import { GatewayPortalPage } from "@pages/taga-tagb-gateway-portal";
import { MasterDashboardPage } from "@pages/taga-tagc-master-dashboard";
import { TelemetryPanelPage } from "@pages/taga-telemetry-panel";
import { WidgetsViewPage } from "@pages/taga-widgets-view";
import { BillingHistoryPage } from "@pages/tagb-billing-history";
import { CartSummaryPage } from "@pages/tagb-cart-summary";
import { CheckoutPage } from "@pages/tagb-checkout";
import { TagBEditOrderModal } from "@pages/tagb-edit-order-modal";
import { InvoiceDetailsPage } from "@pages/tagb-invoice-details";
import { LoginPage } from "@pages/tagb-login";
import { TagBNavBar } from "@pages/tagb-navbar-section";
import { OldCheckoutPage } from "@pages/tagb-old-checkout";
import { PaymentMethodsPage } from "@pages/tagb-payment-methods";
import { SubscriptionPlansPage } from "@pages/tagb-subscription-plans";
import { TagCNavBar } from "@pages/tagc-navbar-section";
import { PermissionsGridPage } from "@pages/tagc-permissions-grid";
import { TagCRoleModal } from "@pages/tagc-role-modal";
import { SecurityAuditPage } from "@pages/tagc-security-audit";
import { SessionManagerPage } from "@pages/tagc-session-manager";
import { SettingsPage } from "@pages/tagc-settings";
import { SettingsDialog } from "@pages/tagc-settings-dialog";
import { SystemLogsPage } from "@pages/tagc-system-logs";
import { UserActivityPage } from "@pages/tagc-user-activity";
import { UserProfilePage } from "@pages/tagc-user-profile";
import ENV, { requireServiceBaseApiUrl, requireServiceCredentials, resolveTestEnv } from "@utils/testEnv";
import { getAccessTokenForOrigin } from "@workflows/workflows-token";

type AppSubscriptions = {
  taga: string;
  tagaPrimary: string;
  tagaSecondary: string;
  tagaLegacy: string;
  tagaRegional: string;
  qa: string;
  demo: string;
  dev: string;
  regionUs: string;
  regionEu: string;
  prod: string;
};

type AppApiSubscriptions = {
  taga: string;
  tagb: string;
  tagc: string;
  cross: string;
};

type AppApiSubscriptionOverrides = Partial<AppApiSubscriptions>;

const defaultApiSubscriptions: AppApiSubscriptions = {
  taga: ENV.ENV_QA_SUBSCRIPTION_ID,
  tagb: ENV.TAGB_BILLING_SUBSCRIPTION_ID,
  tagc: ENV.TAGC_AUDIT_SUBSCRIPTION_ID,
  cross: ENV.ENV_DEV_SUBSCRIPTION_ID,
};

type TagAModels = {
  tagaWeb: string;
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

type TagBModels = {
  tagbWeb: string;
  billingHistory: BillingHistoryPage;
  cartSummary: CartSummaryPage;
  checkout: CheckoutPage;
  editOrderModal: TagBEditOrderModal;
  invoiceDetails: InvoiceDetailsPage;
  login: LoginPage;
  navBar: TagBNavBar;
  oldCheckout: OldCheckoutPage;
  paymentMethods: PaymentMethodsPage;
  subscriptionPlans: SubscriptionPlansPage;
};

type TagCModels = {
  tagcWeb: string;
  navBar: TagCNavBar;
  permissionsGrid: PermissionsGridPage;
  roleModal: TagCRoleModal;
  securityAudit: SecurityAuditPage;
  sessionManager: SessionManagerPage;
  settings: SettingsPage;
  settingsDialog: SettingsDialog;
  systemLogs: SystemLogsPage;
  userActivity: UserActivityPage;
  userProfile: UserProfilePage;
};

type CrossModels = {
  gatewayPortal: GatewayPortalPage;
  masterDashboard: MasterDashboardPage;
};

type TagAApiModels = {
  tagaApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  exportSettings: TagAExportSettingsApi;
  gatewayRouter: GatewayRouterApi;
  metrics: MetricsApi;
  telemetry: TelemetryApi;
  v1Deprecated: V1DeprecatedApi;
};

type TagBApiModels = {
  tagbApi: string;
  tagbApiWithoutSubscription: string;
  handler: ApiHandler;
  subscriptionId: string;
  gatewayRouter: GatewayRouterApi;
  legacyPayments: LegacyPaymentsApi;
  paymentGateway: PaymentGatewayApi;
  subscription: SubscriptionApi;
  tableSettings: TagBTableSettingsApi;
};

type TagCApiModels = {
  tagcApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  auditJobs: TagCAuditJobsApi;
  endpoints: AuthEndpoints;
  settings: SettingsApi;
};

type ServiceApiModels = {
  serviceApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  telemetry: ServiceTelemetryApi;
  billing: ServiceBillingApi;
  auth: ServiceAuthApi;
};

export type App = {
  page: Page;
  createCsvParser: (delimiter?: string) => CsvParser;
  createExportModal: (defaultFormat?: string) => TagAExportSettingsModal;
  subscriptions: AppSubscriptions;
  taga: TagAModels;
  tagb: TagBModels;
  tagc: TagCModels;
  cross: CrossModels;
  tagaApi: TagAApiModels;
  tagbApi: TagBApiModels;
  tagcApi: TagCApiModels;
  serviceApi: ServiceApiModels;
};

const toOrigin = (url: string): string => (url ? new URL(url).origin : "");

/*
  Testing multiline formatting & unmatched comment braces:
  { { { }
*/
export const test = base.extend<{ app: App; apiSubscriptions: AppApiSubscriptionOverrides }>({
  apiSubscriptions: [
    defaultApiSubscriptions,
    { option: true },
  ],
  app: async ({ page, request, apiSubscriptions }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);
    const primarySubscriptionId = ENV.TAGA_PRIMARY_SUBSCRIPTION_ID;
    const configuredApiSubscriptions = { ...defaultApiSubscriptions, ...apiSubscriptions };
    const tagaSubscriptionId = configuredApiSubscriptions.taga;
    const tagbSubscriptionId = configuredApiSubscriptions.tagb;
    const tagcSubscriptionId = configuredApiSubscriptions.tagc;

    const tagaHandler = new ApiHandler(
      request,
      env.tagaBaseApiUrl,
      getAccessTokenForOrigin(env.state, toOrigin(env.tagaBaseWebUrl)),
    );
    const tagbHandler = new ApiHandler(
      request,
      env.tagbBaseApiUrl,
      getAccessTokenForOrigin(env.state, toOrigin(env.tagbBaseWebUrl)),
    );
    const tagcHandler = new ApiHandler(
      request,
      env.tagcBaseApiUrl,
      getAccessTokenForOrigin(env.state, toOrigin(env.tagcBaseWebUrl)),
    );
    let serviceApiModels: ServiceApiModels | undefined;

    const app: App = {
      page,
      createCsvParser: (delimiter?: string) => new CsvParser(delimiter),
      createExportModal: (defaultFormat?: string) => new TagAExportSettingsModal(page, defaultFormat),
      subscriptions: {
        taga: tagaSubscriptionId,
        tagaPrimary: primarySubscriptionId,
        tagaSecondary: ENV.TAGA_SECONDARY_SUBSCRIPTION_ID,
        tagaLegacy: ENV.TAGA_LEGACY_SUBSCRIPTION_ID,
        tagaRegional: ENV.TAGA_REGIONAL_SUBSCRIPTION_ID,
        qa: ENV.ENV_QA_SUBSCRIPTION_ID,
        demo: ENV.ENV_DEMO_SUBSCRIPTION_ID,
        dev: ENV.ENV_DEV_SUBSCRIPTION_ID,
        regionUs: ENV.REGION_US_SUBSCRIPTION_ID,
        regionEu: ENV.REGION_EU_SUBSCRIPTION_ID,
        prod: ENV.ENV_PROD_SUBSCRIPTION_ID,
      },
      taga: {
        tagaWeb: env.tagaBaseWebUrl,
        analytics:
          new AnalyticsPage(page),
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
      },
      tagb: {
        tagbWeb: env.tagbBaseWebUrl,
        billingHistory: new BillingHistoryPage(page),
        cartSummary: new CartSummaryPage(page),
        checkout: new CheckoutPage(page),
        editOrderModal: new TagBEditOrderModal(page),
        invoiceDetails: new InvoiceDetailsPage(page),
        login: new LoginPage(page),
        navBar: new TagBNavBar(page),
        oldCheckout: new OldCheckoutPage(page),
        paymentMethods: new PaymentMethodsPage(page),
        subscriptionPlans: new SubscriptionPlansPage(page),
      },
      tagc: {
        tagcWeb: env.tagcBaseWebUrl,
        navBar: new TagCNavBar(page),
        permissionsGrid: new PermissionsGridPage(page),
        roleModal: new TagCRoleModal(page),
        securityAudit: new SecurityAuditPage(page),
        sessionManager: new SessionManagerPage(page),
        settings: new SettingsPage(page),
        settingsDialog: new SettingsDialog(page),
        systemLogs: new SystemLogsPage(page),
        userActivity: new UserActivityPage(page),
        userProfile: new UserProfilePage(page),
      },
      cross: {
        gatewayPortal: new GatewayPortalPage(page),
        masterDashboard: new MasterDashboardPage(page),
      },
      tagaApi: {
        tagaApi: env.tagaBaseApiUrl,
        handler: tagaHandler,
        subscriptionId: tagaSubscriptionId,
        exportSettings: new TagAExportSettingsApi(tagaHandler, tagaSubscriptionId),
        gatewayRouter: new GatewayRouterApi(tagaHandler, tagaSubscriptionId),
        metrics: new MetricsApi(tagaHandler, tagaSubscriptionId),
        telemetry: new TelemetryApi(tagaHandler, tagaSubscriptionId),
        v1Deprecated: new V1DeprecatedApi(tagaHandler, tagaSubscriptionId),
      },
      tagbApi: {
        tagbApi: env.tagbBaseApiUrl,
        tagbApiWithoutSubscription: env.tagbBaseApiUrlWithoutSubscription,
        handler: tagbHandler,
        subscriptionId: tagbSubscriptionId,
        gatewayRouter: new GatewayRouterApi(tagbHandler, tagbSubscriptionId),
        legacyPayments: new LegacyPaymentsApi(tagbHandler, tagbSubscriptionId),
        paymentGateway: new PaymentGatewayApi(tagbHandler, tagbSubscriptionId),
        subscription: new SubscriptionApi(tagbHandler, tagbSubscriptionId),
        tableSettings: new TagBTableSettingsApi(tagbHandler, tagbSubscriptionId),
      },
      tagcApi: {
        tagcApi: env.tagcBaseApiUrl,
        handler: tagcHandler,
        subscriptionId: tagcSubscriptionId,
        auditJobs: new TagCAuditJobsApi(tagcHandler, tagcSubscriptionId),
        endpoints: new AuthEndpoints(tagcHandler, tagcSubscriptionId),
        settings: new SettingsApi(tagcHandler, tagcSubscriptionId),
      },
      // Lazy: Service credentials are only required by tests that use serviceApi.
      get serviceApi() {
        if (!serviceApiModels) {
          const serviceBaseApiUrl = requireServiceBaseApiUrl(env.envName);
          const { subscriptionId, basicToken } = requireServiceCredentials();
          const serviceHandler = new ApiHandler(request, serviceBaseApiUrl, basicToken, "Basic");
          serviceApiModels = {
            serviceApi: serviceBaseApiUrl,
            handler: serviceHandler,
            subscriptionId,
            telemetry: new ServiceTelemetryApi(serviceHandler),
            billing: new ServiceBillingApi(serviceHandler),
            auth: new ServiceAuthApi(serviceHandler),
          };
        }
        return serviceApiModels;
      },
    };

    await use(app);
  },
});

export { expect };
