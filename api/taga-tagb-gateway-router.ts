export class GatewayRouterApi {
  constructor(page) {}
  async routeIncomingRequest(): Promise<void> {}
  async getActiveRoutes(): Promise<string[]> { return []; }
}
