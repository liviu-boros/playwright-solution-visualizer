import { DropdownComponent } from "@components/Dropdown";
import { GridTable } from "@components/GridTable";
import { ModalComponent } from "@components/Modal";

export class TagCRoleModal {
  constructor(
    page: any,
    public readonly defaultRole: string = 'viewer',
  ) {}

  async assignRole(role: string = this.defaultRole): Promise<string> {
    const modal = new ModalComponent(null as any);
    const drop = new DropdownComponent(null as any);
    const grid = new GridTable(null as any);
    void modal;
    void drop;
    void grid;
    return role;
  }
}
