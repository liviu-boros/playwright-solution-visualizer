import type { ApiHandler } from '@components/ApiHandler';

export class V1DeprecatedApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async fetchV1Data(): Promise<void> {}
}
