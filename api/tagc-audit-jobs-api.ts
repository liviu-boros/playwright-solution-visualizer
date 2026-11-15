import type { ApiHandler } from '@components/ApiHandler';

export class TagCAuditJobsApi {
  readonly handler: ApiHandler | any;
  readonly subscriptionId?: string;

  constructor(handlerOrPage?: ApiHandler | any, subscriptionId?: string) {
    this.handler = handlerOrPage;
    this.subscriptionId = subscriptionId;
  }

  async triggerAuditJob(): Promise<{ jobId: string; subscriptionId?: string }> {
    return { jobId: 'audit-job-001', subscriptionId: this.subscriptionId };
  }

  async getAuditJobStatus(): Promise<string> {
    return 'completed';
  }
}
