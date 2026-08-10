import { test } from '@playwright/test';
import { PaymentGatewayApi } from '@api/tagb-payment-gateway';
import { SubscriptionApi } from '@api/tagb-subscription-api';
import { processBillingCycle, sendBillingNotifications } from '@workflows';
import { BillingHistoryPage } from '@pages/tagb-billing-history';
import { SubscriptionPlansPage } from '@pages/tagb-subscription-plans';
import { InvoiceDetailsPage } from '@pages/tagb-invoice-details';
import { CheckoutPage } from '@pages/tagb-checkout';

test('Service > Billing > Process Recurring Invoices', async ({ page }) => {
  const gateway = new PaymentGatewayApi(page);
  const subApi = new SubscriptionApi(page);
  const billing = new BillingHistoryPage(page);
  const plans = new SubscriptionPlansPage(page);
  const invoice = new InvoiceDetailsPage(page);
  const checkout = new CheckoutPage(page);
  await processBillingCycle();
  await sendBillingNotifications();
});

test('Service > Billing > Calculate Prorated Upgrade Charges', async ({ page }) => {});
test('Service > Billing > Retry Failed Dunning Payment Attempts', async ({ page }) => {});
test('Service > Billing > Issue Automatic Refund Credit Memo', async ({ page }) => {});
test('Service > Billing > Generate Annual Tax Invoice Summary PDF', async ({ page }) => {});
