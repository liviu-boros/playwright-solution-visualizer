import { MetricsApi } from '@api/taga-metrics-api';

export const MAX_RETRY_COUNT = 5;

export class WorkflowManager {
  async runWorkflow(): Promise<void> {}
}

// Private internal helper function (not exported, not in workflows/index.ts)
function computeExportChecksum(payload: any): string {
  return 'chk_hash_export';
}

export async function triggerDataExport() {
  const metrics = new MetricsApi(null);
  computeExportChecksum(metrics);
}

export function fetchExportProgress() {
  computeExportChecksum({});
}

export async function cancelExportJob() {}
