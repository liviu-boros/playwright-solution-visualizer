import type { ApiHandler } from '@components/ApiHandler';

export class SettingsApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async getAccountPreferences(): Promise<object> { return {}; }
  async updatePreference(): Promise<void> {}
}
