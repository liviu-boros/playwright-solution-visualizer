import { Locator } from "@playwright/test";

export class Hint {
  constructor(locator: Locator) {
    const hintLocator = locator;
    return Object.assign(hintLocator);
  }
}
