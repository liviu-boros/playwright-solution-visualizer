import type { ApiHandler } from '@components/ApiHandler';

export class ServiceAuthApi {
  readonly handler: ApiHandler | any;

  constructor(handlerOrPage?: ApiHandler | any) {
    this.handler = handlerOrPage;
  }

  async introspectClient(): Promise<{ active: boolean; authScheme: string }> {
    return {
      active: true,
      authScheme: this.handler?.authScheme || 'Basic',
    };
  }
}
