import type { ApiHandler } from '@components/ApiHandler';

export class AuthEndpoints {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async refreshToken(): Promise<string> {
    return "new-token";
  }
}

export const EndpointsApi = AuthEndpoints;
export type EndpointsApi = AuthEndpoints;
