export class PaymentGatewayApi {
  constructor(page) {}
  async verifyTransaction(): Promise<boolean> { return true; }
  async cancelSubscription(): Promise<void> {}
}
