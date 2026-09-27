import { test, expect } from '../fixtures/tagb.fixture';

test('E2E > Checkout > Validate Express Checkout Options', async ({ tagbPages, tagbApi }) => {
  await tagbApi.paymentGateway.verifyTransaction();
  await tagbApi.subscription.fetchSubscriptionTiers();
  await tagbPages.checkout.proceedToCheckout();
  await tagbPages.billingHistory.viewBillingHistory();
  await tagbPages.cartSummary.viewCartItems();
  await tagbPages.paymentMethods.selectPaymentMethod();
});

test("E2E > Checkout > Apply Coupon Promo Code", async ({ page }) => {});
test("E2E > Checkout > Validate Saved Credit Card CVV", async ({ page }) => {});
test("E2E > Checkout > Toggle Tax Exemption Certificate", async ({ page }) => {});
test("E2E > Checkout > Verify Order Confirmation Summary", async ({ page }) => {});
