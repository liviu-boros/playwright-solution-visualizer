import { TextboxComponent } from "@components/Textbox";
import { Hint } from "@components/Hint";

export class LoginPage {
  constructor(page: any) {}
  async loginUser(): Promise<void> {
    const box = new TextboxComponent(null);
    const hint = new Hint(null);
  }
}
