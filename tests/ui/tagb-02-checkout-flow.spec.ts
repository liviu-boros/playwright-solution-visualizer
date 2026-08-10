import { test } from "@playwright/test";
import { PaymentGatewayApi } from "@api/tagb-payment-gateway";
import { SubscriptionApi } from "@api/tagb-subscription-api";
import { processBillingCycle, processPaymentTransaction } from "@workflows";
import { CheckoutPage } from "@pages/tagb-checkout";
import { BillingHistoryPage } from "@pages/tagb-billing-history";
import { CartSummaryPage } from "@pages/tagb-cart-summary";
import { PaymentMethodsPage } from "@pages/tagb-payment-methods";

test("E2E > Checkout > Validate Express Checkout Options", async ({ page }) => {
  const checkout = new CheckoutPage(page);
  const billing = new BillingHistoryPage(page);
  const cart = new CartSummaryPage(page);
  const methods = new PaymentMethodsPage(page);
  const gateway = new PaymentGatewayApi(page);
  const subApi = new SubscriptionApi(page);
  await processBillingCycle();
  await processPaymentTransaction();
});

test("E2E > Checkout > Apply Coupon Promo Code", async ({ page }) => {});
test("E2E > Checkout > Validate Saved Credit Card CVV", async ({ page }) => {});
test("E2E > Checkout > Toggle Tax Exemption Certificate", async ({ page }) => {});
test("E2E > Checkout > Verify Order Confirmation Summary", async ({ page }) => {});
