import { test as base, expect } from '@playwright/test';
// Api Models
import { PaymentGatewayApi } from '../../api/tagb-payment-gateway';
import { SubscriptionApi } from '../../api/tagb-subscription-api';
import { LegacyPaymentsApi } from '../../api/tagb-legacy-payments-api';
import { GatewayRouterApi } from '../../api/taga-tagb-gateway-router';
// Pages
import { BillingHistoryPage } from '../../pages/tagb-billing-history';
import { CartSummaryPage } from '../../pages/tagb-cart-summary';
import { CheckoutPage } from '../../pages/tagb-checkout';
import { InvoiceDetailsPage } from '../../pages/tagb-invoice-details';
import { LoginPage } from '../../pages/tagb-login';
import { PaymentMethodsPage } from '../../pages/tagb-payment-methods';
import { SubscriptionPlansPage } from '../../pages/tagb-subscription-plans';
import { OldCheckoutPage } from '../../pages/tagb-old-checkout';

export type TagBPages = {
  billingHistory: BillingHistoryPage;
  cartSummary: CartSummaryPage;
  checkout: CheckoutPage;
  invoiceDetails: InvoiceDetailsPage;
  login: LoginPage;
  paymentMethods: PaymentMethodsPage;
  subscriptionPlans: SubscriptionPlansPage;
  oldCheckout: OldCheckoutPage;
};

export type TagBApi = {
  paymentGateway: PaymentGatewayApi;
  subscription: SubscriptionApi;
  legacyPayments: LegacyPaymentsApi;
  gatewayRouter: GatewayRouterApi;
};

export const test = base.extend<{ tagbPages: TagBPages; tagbApi: TagBApi }>({
  tagbPages: async ({ page }, use) => {
    await use({
      billingHistory: new BillingHistoryPage(page),
      cartSummary: new CartSummaryPage(page),
      checkout: new CheckoutPage(page),
      invoiceDetails: new InvoiceDetailsPage(page),
      login: new LoginPage(page),
      paymentMethods: new PaymentMethodsPage(page),
      subscriptionPlans: new SubscriptionPlansPage(page),
      oldCheckout: new OldCheckoutPage(page),
    });
  },
  tagbApi: async ({ request }, use) => {
    await use({
      paymentGateway: new PaymentGatewayApi(request),
      subscription: new SubscriptionApi(request),
      legacyPayments: new LegacyPaymentsApi(request),
      gatewayRouter: new GatewayRouterApi(request),
    });
  },
});

export { expect };
