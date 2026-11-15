import { DropdownComponent } from "@components/Dropdown";
import { Hint } from "@components/Hint";

export class TagANavBar {
  constructor(page: any) {}

  async switchEnvironment(): Promise<void> {
    const drop = new DropdownComponent(null as any);
    const hint = new Hint(null as any);
    void drop;
    void hint;
  }

  async openProfileMenu(): Promise<void> {}
}
