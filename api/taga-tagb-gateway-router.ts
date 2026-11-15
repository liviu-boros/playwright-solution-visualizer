import type { ApiHandler } from '@components/ApiHandler';

export class GatewayRouterApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async routeIncomingRequest(): Promise<void> {}
  async getActiveRoutes(): Promise<string[]> { return []; }
}
