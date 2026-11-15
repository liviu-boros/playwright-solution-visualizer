import type { ApiHandler } from '@components/ApiHandler';

export class ServiceTelemetryApi {
  readonly handler: ApiHandler | any;

  constructor(handlerOrPage?: ApiHandler | any) {
    this.handler = handlerOrPage;
  }

  async getStreams(): Promise<{ authScheme: string; streams: string[] }> {
    return {
      authScheme: this.handler?.authScheme || 'Basic',
      streams: ['metrics-live', 'alerts-v2'],
    };
  }
}
