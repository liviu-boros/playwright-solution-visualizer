import type { ApiHandler } from '@components/ApiHandler';

export class TagAExportSettingsApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async getExportSettings(): Promise<{ format: string; subscriptionId?: string }> {
    return { format: 'csv', subscriptionId: this.subscriptionId };
  }

  async updateExportSettings(format: string): Promise<{ format: string }> {
    return { format };
  }
}
