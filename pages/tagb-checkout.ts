import { ModalComponent } from "@components/Modal";
import { TextboxComponent } from "@components/Textbox";
import { DropdownComponent } from "@components/Dropdown";

export class CheckoutPage {
  constructor(page: any) {}
  async proceedToCheckout(): Promise<void> {
    const modal = new ModalComponent(null);
    const box = new TextboxComponent(null);
    const drop = new DropdownComponent(null);
  }
}
