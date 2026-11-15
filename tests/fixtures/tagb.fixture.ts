import { expect, test as base } from "@playwright/test";
import { GatewayRouterApi } from "@api/taga-tagb-gateway-router";
import { ServiceBillingApi } from "@api/tagb-service-billing-api";
import { LegacyPaymentsApi } from "@api/tagb-legacy-payments-api";
import { PaymentGatewayApi } from "@api/tagb-payment-gateway";
import { SubscriptionApi } from "@api/tagb-subscription-api";
import { TagBTableSettingsApi } from "@api/tagb-table-settings-api";
import { ApiHandler } from "@components/ApiHandler";
import { CsvParser } from "@parsers/csv-parser";
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
import ENV, { requireServiceBaseApiUrl, requireServiceCredentials, resolveTestEnv } from "@utils/testEnv";
import { getAccessTokenForOrigin } from "@workflows/workflows-token";

type TagBSubscriptions = {
  api: string;
  billing: string;
  dev: string;
};

type TagBApiSubscriptions = {
  api: string;
};

type TagBSubscriptionOverrides = Partial<TagBApiSubscriptions>;

const defaultTagBSubscriptions: TagBApiSubscriptions = {
  api: ENV.TAGB_BILLING_SUBSCRIPTION_ID,
};

type ServiceTagBApiModels = {
  serviceApi: string;
  handler: ApiHandler;
  subscriptionId: string;
  billing: ServiceBillingApi;
};

export type TagBPages = {
  tagbWeb: string;
  createCsvParser: (delimiter?: string) => CsvParser;
  createEditOrderModal: (currency?: string) => TagBEditOrderModal;
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

export type TagBApi = {
  tagbApi: string;
  tagbApiWithoutSubscription: string;
  handler: ApiHandler;
  subscriptionId: string;
  subscriptions: TagBSubscriptions;
  gatewayRouter: GatewayRouterApi;
  legacyPayments: LegacyPaymentsApi;
  paymentGateway: PaymentGatewayApi;
  subscription: SubscriptionApi;
  tableSettings: TagBTableSettingsApi;
  service: ServiceTagBApiModels;
};

const toOrigin = (url: string): string => (url ? new URL(url).origin : "");

export const test = base.extend<{
  tagbPages: TagBPages;
  tagbApi: TagBApi;
  tagbSubscriptions: TagBSubscriptionOverrides;
}>({
  tagbSubscriptions: [
    defaultTagBSubscriptions,
    { option: true },
  ],
  tagbPages: async ({ page }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);

    await use({
      tagbWeb: env.tagbBaseWebUrl,
      createCsvParser: (delimiter?: string) => new CsvParser(delimiter),
      createEditOrderModal: (currency?: string) => new TagBEditOrderModal(page, currency),
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
    });
  },
  tagbApi: async ({ request, tagbSubscriptions }, use, testInfo) => {
    const env = resolveTestEnv(testInfo.project.name);
    const configuredSubscriptions = { ...defaultTagBSubscriptions, ...tagbSubscriptions };
    const subscriptionId = configuredSubscriptions.api;

    const tagbHandler = new ApiHandler(
      request,
      env.tagbBaseApiUrl,
      getAccessTokenForOrigin(env.state, toOrigin(env.tagbBaseWebUrl)),
    );
    let serviceModels: ServiceTagBApiModels | undefined;

    await use({
      tagbApi: env.tagbBaseApiUrl,
      tagbApiWithoutSubscription: env.tagbBaseApiUrlWithoutSubscription,
      handler: tagbHandler,
      subscriptionId,
      subscriptions: {
        api: subscriptionId,
        billing: ENV.TAGB_BILLING_SUBSCRIPTION_ID,
        dev: ENV.ENV_DEV_SUBSCRIPTION_ID,
      },
      gatewayRouter: new GatewayRouterApi(tagbHandler, subscriptionId),
      legacyPayments: new LegacyPaymentsApi(tagbHandler, subscriptionId),
      paymentGateway: new PaymentGatewayApi(tagbHandler, subscriptionId),
      subscription: new SubscriptionApi(tagbHandler, subscriptionId),
      tableSettings: new TagBTableSettingsApi(tagbHandler, subscriptionId),
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
            billing: new ServiceBillingApi(serviceHandler),
          };
        }
        return serviceModels;
      },
    });
  },
});

export { expect };
