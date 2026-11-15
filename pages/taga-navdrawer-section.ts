import { Hint } from "@components/Hint";

export class TagANavDrawerSection {
  constructor(page: any) {}

  async navigateToSection(sectionName: string): Promise<string> {
    const hint = new Hint(null as any);
    void hint;
    return sectionName;
  }

  async collapseDrawer(): Promise<void> {}
}
