import { GridTable } from "@components/GridTable";
import { TextboxComponent } from "@components/Textbox";

export class BillingHistoryPage {
  constructor(page: any) {}
  async viewBillingHistory(): Promise<void> {
    const grid = new GridTable(null);
    const box = new TextboxComponent(null);
  }
}
