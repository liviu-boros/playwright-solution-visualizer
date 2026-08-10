import { GatewayRouterApi } from "@api/taga-tagb-gateway-router";

// Private internal helper function (not exported, not in workflows/index.ts)
function formatNotificationTemplate(message: string): string {
  return `[NOTIFICATION] ${message}`;
}

export async function dispatchEmailAlert() {
  const router = new GatewayRouterApi(null);
  formatNotificationTemplate("Email alert triggered");
}

export function queueSMSNotification() {
  formatNotificationTemplate("SMS queued");
}
