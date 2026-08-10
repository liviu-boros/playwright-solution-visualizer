import { TextboxComponent } from "@components/Textbox";
import { DropdownComponent } from "@components/Dropdown";

export class SettingsPage {
  constructor(page: any) {}
  async updateSettings(): Promise<void> {
    const box = new TextboxComponent(null);
    const drop = new DropdownComponent(null);
  }
}
