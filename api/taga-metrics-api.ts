export class MetricsApi {
  constructor(page) {}
  async getSystemMetrics(): Promise<object> { return {}; }
  async pushTelemetryEvent(): Promise<void> {}
}

function _internalCalc(): number {
  return 42;
}

export function calculateRawBytes(): number {
  return _internalCalc();
}

