import { test } from '@playwright/test';
import { PaymentGatewayApi } from '@api/tagb-payment-gateway';
import { verifyPaymentAuth } from '@workflows';
import { CartSummaryPage } from '@pages/tagb-cart-summary';
import { LoginPage } from '@pages/tagb-login';
import { InvoiceDetailsPage } from '@pages/tagb-invoice-details';

test('UI > Cart > Add Items to Cart', async ({ page }) => {
  const cart = new CartSummaryPage(page);
  const login = new LoginPage(page);
  const invoice = new InvoiceDetailsPage(page);
  const gateway = new PaymentGatewayApi(page);
  await verifyPaymentAuth();
});

test('UI > Cart > Remove Items from Cart', async ({ page }) => {});
test('UI > Cart > Update Quantity Selector', async ({ page }) => {});
test('UI > Cart > Save Cart Items for Later', async ({ page }) => {});
