import { TextboxComponent } from "@components/Textbox";
import { ModalComponent } from "@components/Modal";

export class UserProfilePage {
  constructor(page: any) {}
  async viewProfile(): Promise<void> {
    const box = new TextboxComponent(null);
    const modal = new ModalComponent(null);
  }
}
