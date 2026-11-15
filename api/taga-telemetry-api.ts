import type { ApiHandler } from '@components/ApiHandler';

export class TelemetryApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async sendTelemetryPayload(): Promise<void> {}
  async fetchLiveAlerts(): Promise<void> {}
}
