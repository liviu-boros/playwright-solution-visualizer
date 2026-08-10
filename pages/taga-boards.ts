import { ModalComponent } from "@components/Modal";
import { DropdownComponent } from "@components/Dropdown";

export class BoardsPage {
  constructor(page: any) {}
  async createNewBoard(): Promise<void> {
    const modal = new ModalComponent(null);
    const drop = new DropdownComponent(null);
  }
  async deleteActiveBoard(): Promise<void> {}
}
