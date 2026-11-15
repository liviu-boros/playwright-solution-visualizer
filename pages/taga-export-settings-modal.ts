import { DropdownComponent } from "@components/Dropdown";
import { ModalComponent } from "@components/Modal";
import { TextboxComponent } from "@components/Textbox";

export class TagAExportSettingsModal {
  constructor(
    page: any,
    public readonly defaultFormat: string = 'csv',
  ) {}

  async selectExportFormat(format: string = this.defaultFormat): Promise<string> {
    const modal = new ModalComponent(null as any);
    const drop = new DropdownComponent(null as any);
    const box = new TextboxComponent(null as any);
    void modal;
    void drop;
    void box;
    return format;
  }

  async saveExportPreset(): Promise<void> {}
}
