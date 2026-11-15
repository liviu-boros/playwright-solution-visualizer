import type { ApiHandler } from '@components/ApiHandler';

export class TagBTableSettingsApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async getColumnLayout(): Promise<{ columns: string[]; subscriptionId?: string }> {
    return { columns: ['id', 'amount', 'status'], subscriptionId: this.subscriptionId };
  }

  async resetColumnLayout(): Promise<void> {}
}
