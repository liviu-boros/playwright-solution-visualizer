import { Locator } from "@playwright/test";

export class ModalComponent {
  constructor(locator: Locator) {
    return Object.assign(locator, {
      OpenModal: this.OpenModal,
      CloseModal: this.CloseModal,
      ConfirmAction: this.ConfirmAction,
    });
  }
  async OpenModal(): Promise<void> {}
  async CloseModal(): Promise<void> {}
  async ConfirmAction(): Promise<void> {}
}
