import { DropdownComponent } from "@components/Dropdown";
import { TextboxComponent } from "@components/Textbox";

export class TagBNavBar {
  constructor(page: any) {}

  async searchOrders(query: string): Promise<string> {
    const box = new TextboxComponent(null as any);
    const drop = new DropdownComponent(null as any);
    void box;
    void drop;
    return query;
  }
}
