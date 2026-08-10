import { GridTable } from "@components/GridTable";
import { ModalComponent } from "@components/Modal";
import { DropdownComponent } from "@components/Dropdown";

export class MasterDashboardPage {
  constructor(page: any) {}
  async renderDashboard(): Promise<void> {
    const grid = new GridTable(null);
    const modal = new ModalComponent(null);
    const drop = new DropdownComponent(null);
  }
}
