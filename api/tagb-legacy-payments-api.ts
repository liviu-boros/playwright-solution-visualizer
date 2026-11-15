import type { ApiHandler } from '@components/ApiHandler';

export class LegacyPaymentsApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async chargeV1Card(): Promise<void> {}
}
