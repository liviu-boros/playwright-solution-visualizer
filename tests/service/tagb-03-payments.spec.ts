import { test } from '@playwright/test';
import { PaymentGatewayApi } from '@api/tagb-payment-gateway';
import { processPaymentTransaction, verifyPaymentAuth } from '@workflows';
import { PaymentMethodsPage } from '@pages/tagb-payment-methods';
import { CartSummaryPage } from '@pages/tagb-cart-summary';
import { BillingHistoryPage } from '@pages/tagb-billing-history';

test('Service > Payments > Refund Payment Request', async ({ page }) => {
  const gateway = new PaymentGatewayApi(page);
  const methods = new PaymentMethodsPage(page);
  const cart = new CartSummaryPage(page);
  const billing = new BillingHistoryPage(page);
  await processPaymentTransaction();
  await verifyPaymentAuth();
});

test('Service > Payments > Authorize Credit Card Hold', async ({ page }) => {});
test('Service > Payments > Capture Authorized Pre-Auth Hold', async ({ page }) => {});
test('Service > Payments > Void Authorization Transaction', async ({ page }) => {});
test('Service > Payments > Verify 3D Secure v2 OTP Verification', async ({ page }) => {});
test('Service > Payments > Handle Chargeback Fraud Alert Payload', async ({ page }) => {});
