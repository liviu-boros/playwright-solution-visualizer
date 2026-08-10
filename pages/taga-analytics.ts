import { GridTable } from "@components/GridTable";
import { Hint } from "@components/Hint";

export class AnalyticsPage {
  constructor(page: any) {}
  async viewSystemMetrics(): Promise<void> {
    const table = new GridTable(null);
    const hint = new Hint(null);
  }
}
