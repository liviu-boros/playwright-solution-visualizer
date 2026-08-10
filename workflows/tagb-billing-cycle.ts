import { PaymentGatewayApi } from "@api/tagb-payment-gateway";

// Private internal helper function (not exported, not in workflows/index.ts)
function calculateProratedAmount(amount: number): number {
  return amount * 0.85;
}

export async function processBillingCycle() {
  const gateway = new PaymentGatewayApi(null);
  calculateProratedAmount(100);
}

export function sendBillingNotifications() {}
