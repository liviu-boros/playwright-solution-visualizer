import { Locator } from "@playwright/test";

export class ModalComponent {
  isOpen = false
  constructor(locator: Locator) {
    return Object.assign(locator || {}, {
      OpenModal: this.OpenModal,
      CloseModal: this.CloseModal,
      ConfirmAction: this.ConfirmAction,
      DismissModal: this.DismissModal,
    });
  }
  async OpenModal(): Promise<void> {}
  async CloseModal(): Promise<void> {}
  async ConfirmAction(): Promise<void> {}
  DismissModal = async (): Promise<void> => {}
}
