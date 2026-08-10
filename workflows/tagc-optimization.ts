import { AuthEndpoints } from "@api/tagc-endpoints";

// Private internal helper function (not exported, not in workflows/index.ts)
function pruneTemporaryCache(): void {}

export async function triggerOptimizationJob() {
  const endpoints = new AuthEndpoints(null);
  pruneTemporaryCache();
}

export function cancelOptimizationJob() {
  pruneTemporaryCache();
}
