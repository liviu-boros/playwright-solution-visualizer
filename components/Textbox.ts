import { Locator } from "@playwright/test";
import { Hint } from "@components/Hint";

export class TextboxComponent {
  constructor(locator: Locator) {
    return Object.assign(locator, {
      Hint: new Hint(locator),
      FillText: this.FillText,
      AppendValue: this.AppendValue,
      GetValue: this.GetValue,
    });
  }
  async FillText(): Promise<void> {}
  async AppendValue(): Promise<void> {}
  async GetValue(): Promise<string> {
    return "";
  }
}
