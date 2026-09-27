import { test as base, expect, Page } from '@playwright/test';
import { TagAPages, TagAApi } from './taga.fixture';
import { TagBPages, TagBApi } from './tagb.fixture';
import { TagCPages, TagCApi } from './tagc.fixture';

// Api Models
import { MetricsApi } from '../../api/taga-metrics-api';
import { TelemetryApi } from '../../api/taga-telemetry-api';
import { V1DeprecatedApi } from '../../api/taga-v1-deprecated-api';
import { GatewayRouterApi } from '../../api/taga-tagb-gateway-router';
import { PaymentGatewayApi } from '../../api/tagb-payment-gateway';
import { SubscriptionApi } from '../../api/tagb-subscription-api';
import { LegacyPaymentsApi } from '../../api/tagb-legacy-payments-api';
import { AuthEndpoints } from '../../api/tagc-endpoints';
import { SettingsApi } from '../../api/tagc-settings-api';

// Pages
import { AnalyticsPage } from '../../pages/taga-analytics';
import { BoardsPage } from '../../pages/taga-boards';
import { DashboardPage } from '../../pages/taga-dashboard';
import { NotificationsCenterPage } from '../../pages/taga-notifications-center';
import { ReportsPage } from '../../pages/taga-reports';
import { TelemetryPanelPage } from '../../pages/taga-telemetry-panel';
import { WidgetsViewPage } from '../../pages/taga-widgets-view';
import { LegacyPortalPage } from '../../pages/taga-legacy-portal';

import { BillingHistoryPage } from '../../pages/tagb-billing-history';
import { CartSummaryPage } from '../../pages/tagb-cart-summary';
import { CheckoutPage } from '../../pages/tagb-checkout';
import { InvoiceDetailsPage } from '../../pages/tagb-invoice-details';
import { LoginPage } from '../../pages/tagb-login';
import { PaymentMethodsPage } from '../../pages/tagb-payment-methods';
import { SubscriptionPlansPage } from '../../pages/tagb-subscription-plans';
import { OldCheckoutPage } from '../../pages/tagb-old-checkout';

import { PermissionsGridPage } from '../../pages/tagc-permissions-grid';
import { SecurityAuditPage } from '../../pages/tagc-security-audit';
import { SessionManagerPage } from '../../pages/tagc-session-manager';
import { SettingsPage } from '../../pages/tagc-settings';
import { SystemLogsPage } from '../../pages/tagc-system-logs';
import { UserActivityPage } from '../../pages/tagc-user-activity';
import { UserProfilePage } from '../../pages/tagc-user-profile';
import { SettingsDialog } from '../../pages/tagc-settings-dialog';

// Cross-tag Pages
import { GatewayPortalPage } from '../../pages/taga-tagb-gateway-portal';
import { MasterDashboardPage } from '../../pages/taga-tagc-master-dashboard';

export type AppFacade = {
  page: Page;
  taga: TagAPages;
  tagaApi: TagAApi;
  tagb: TagBPages;
  tagbApi: TagBApi;
  tagc: TagCPages;
  tagcApi: TagCApi;
  cross: {
    gatewayPortal: GatewayPortalPage;
    masterDashboard: MasterDashboardPage;
  };
};

/*
  Testing multiline formatting & unmatched comment braces:
  { { { }
*/
export const test = base.extend<{ app: AppFacade }>({
  app: async (
    { page, request },
    use
  ) => {
    const app: AppFacade = {
      page,
      taga: {
        analytics:
          new AnalyticsPage(page),
        boards: new BoardsPage(page),
        dashboard: new DashboardPage(page),
        notificationsCenter: new NotificationsCenterPage(page),
        reports: new ReportsPage(page),
        telemetryPanel: new TelemetryPanelPage(page),
        widgetsView: new WidgetsViewPage(page),
        legacyPortal: new LegacyPortalPage(page),
      },
      tagaApi: {
        metrics: new MetricsApi(request),
        telemetry: new TelemetryApi(request),
        v1Deprecated: new V1DeprecatedApi(request),
        gatewayRouter: new GatewayRouterApi(request),
      },
      tagb: {
        billingHistory: new BillingHistoryPage(page),
        cartSummary: new CartSummaryPage(page),
        checkout: new CheckoutPage(page),
        invoiceDetails: new InvoiceDetailsPage(page),
        login: new LoginPage(page),
        paymentMethods: new PaymentMethodsPage(page),
        subscriptionPlans: new SubscriptionPlansPage(page),
        oldCheckout: new OldCheckoutPage(page),
      },
      tagbApi: {
        paymentGateway: new PaymentGatewayApi(request),
        subscription: new SubscriptionApi(request),
        legacyPayments: new LegacyPaymentsApi(request),
        gatewayRouter: new GatewayRouterApi(request),
      },
      tagc: {
        permissionsGrid: new PermissionsGridPage(page),
        securityAudit: new SecurityAuditPage(page),
        sessionManager: new SessionManagerPage(page),
        settings: new SettingsPage(page),
        systemLogs: new SystemLogsPage(page),
        userActivity: new UserActivityPage(page),
        userProfile: new UserProfilePage(page),
        settingsDialog: new SettingsDialog(page),
      },
      tagcApi: {
        endpoints: new AuthEndpoints(request),
        settings: new SettingsApi(request),
      },
      cross: {
        gatewayPortal: new GatewayPortalPage(page),
        masterDashboard: new MasterDashboardPage(page),
      },
    };
    await use(app);
  },
});

export { expect };
