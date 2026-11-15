import type { ApiHandler } from '@components/ApiHandler';

export class MetricsApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async getSystemMetrics(): Promise<object> { return {}; }
  async pushTelemetryEvent(): Promise<void> {}
}

function _internalCalc(): number {
  return 42;
}

export function calculateRawBytes(): number {
  return _internalCalc();
}

