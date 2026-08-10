import { Locator } from "@playwright/test";
import { Hint } from "./Hint";

export class DropdownComponent {
  constructor(locator: Locator) {
    return Object.assign(locator, {
      SelectOption: this.SelectOption,
      GetSelectedValue: this.GetSelectedValue,
      Hiny: new Hint(locator),
    });
  }
  async SelectOption(): Promise<void> {}
  async GetSelectedValue(): Promise<string> {
    return "";
  }
}
