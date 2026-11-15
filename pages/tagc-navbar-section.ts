import { DropdownComponent } from "@components/Dropdown";
import { Hint } from "@components/Hint";

export class TagCNavBar {
  constructor(page: any) {}

  async selectTenant(tenant: string): Promise<string> {
    const drop = new DropdownComponent(null as any);
    const hint = new Hint(null as any);
    void drop;
    void hint;
    return tenant;
  }
}
