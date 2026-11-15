import type { ApiHandler } from '@components/ApiHandler';

export class SubscriptionApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async fetchSubscriptionTiers(): Promise<void> {}
  async updatePlanSubscription(): Promise<void> {}
}
