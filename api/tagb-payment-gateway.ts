import type { ApiHandler } from '@components/ApiHandler';

export class PaymentGatewayApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async verifyTransaction(): Promise<boolean> { return true; }
  async cancelSubscription(): Promise<void> {}
}
