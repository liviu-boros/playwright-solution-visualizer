import type { ApiHandler } from '@components/ApiHandler';

export class ServiceBillingApi {
  readonly handler: ApiHandler | any;

  constructor(handlerOrPage?: ApiHandler | any) {
    this.handler = handlerOrPage;
  }

  async getInvoices(): Promise<{ authScheme: string; count: number }> {
    return {
      authScheme: this.handler?.authScheme || 'Basic',
      count: 3,
    };
  }
}
