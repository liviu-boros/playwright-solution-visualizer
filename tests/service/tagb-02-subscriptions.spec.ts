import { test } from '@playwright/test';
import { SubscriptionApi } from '@api/tagb-subscription-api';
import { sendBillingNotifications } from '@workflows';
import { SubscriptionPlansPage } from '@pages/tagb-subscription-plans';
import { PaymentMethodsPage } from '@pages/tagb-payment-methods';
import { LoginPage } from '@pages/tagb-login';

test('Service > Subscriptions > Upgrade Account Tier', async ({ page }) => {
  const subApi = new SubscriptionApi(page);
  const plans = new SubscriptionPlansPage(page);
  const methods = new PaymentMethodsPage(page);
  const login = new LoginPage(page);
  await sendBillingNotifications();
});

test('Service > Subscriptions > Downgrade Account Tier to Starter', async ({ page }) => {});
test('Service > Subscriptions > Pause Subscription for 30 Days', async ({ page }) => {});
test('Service > Subscriptions > Resume Paused Subscription', async ({ page }) => {});
