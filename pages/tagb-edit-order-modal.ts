import { ModalComponent } from "@components/Modal";
import { TextboxComponent } from "@components/Textbox";

export class TagBEditOrderModal {
  constructor(
    page: any,
    public readonly currency: string = 'USD',
  ) {}

  async updateOrderNotes(notes: string): Promise<{ currency: string; notes: string }> {
    const modal = new ModalComponent(null as any);
    const box = new TextboxComponent(null as any);
    void modal;
    void box;
    return { currency: this.currency, notes };
  }
}
