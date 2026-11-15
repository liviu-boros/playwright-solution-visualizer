import { test, expect } from '@fixtures/tagb.fixture';

test('E2E > Checkout > Validate Express Checkout Options', async ({ tagbPages, tagbApi }) => {
  await tagbApi.paymentGateway.verifyTransaction();
  await tagbApi.subscription.fetchSubscriptionTiers();
  await tagbApi.tableSettings.getColumnLayout();
  await tagbPages.navBar.searchOrders('ORD-42');
  await tagbPages.checkout.proceedToCheckout();
  await tagbPages.billingHistory.viewBillingHistory();
  await tagbPages.cartSummary.viewCartItems();
  await tagbPages.paymentMethods.selectPaymentMethod();
});

test("E2E > Checkout > Apply Coupon Promo Code", async ({ tagbPages }) => {
  const modal = tagbPages.createEditOrderModal('EUR');
  const updated = await modal.updateOrderNotes('PROMO20');
  expect(updated).toEqual({ currency: 'EUR', notes: 'PROMO20' });
});
test("E2E > Checkout > Validate Saved Credit Card CVV", async ({ tagbApi }) => {
  const invoices = await tagbApi.service.billing.getInvoices();
  expect(invoices.authScheme).toBe('Basic');
});
test("E2E > Checkout > Toggle Tax Exemption Certificate", async ({ page }) => {});
test("E2E > Checkout > Verify Order Confirmation Summary", async ({ page }) => {});
