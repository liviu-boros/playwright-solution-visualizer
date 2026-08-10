import { Locator } from "@playwright/test";

export class GridIcon {
  constructor(Locator: Locator, ensureVisible: () => Promise<void>) {
    return Object.assign(Locator, {
      _ensureVisible: ensureVisible,
      Hover: this.Hover,
      Click: this.Click,
      Tooltip: this.Tooltip,
    });
  }

  async Hover(): Promise<void> {}

  async Click(): Promise<void> {}

  async Tooltip(Locator: Locator): Promise<Locator> {
    return Locator;
  }
}

export class GridRow {
  constructor(row: string | number) {
    return Object.assign(row, {
      Action: this.Action,
    });
  }

  async Action(): Promise<void> {}
}

export class GridCell {
  _ensureVisible!: () => Promise<void>;
  constructor(
    grid: GridTable,
    column: string,
    rowId: string,
    ensureVisible: () => Promise<void>,
  ) {
    return Object.assign({
      _grid: grid,
      _column: column,
      _rowId: rowId,
      _ensureVisible: ensureVisible,
      Click: this.Click,
      DblClick: this.DblClick,
      Fill: this.Fill,
      Option: this.Option,
      Icon: this.Icon,
      Action: this.Action,
      PasteExcelData: this.PasteExcelData,
    });
  }

  async Click(): Promise<void> {}

  async DblClick(): Promise<void> {}

  async Fill(): Promise<void> {}

  async Option(): Promise<void> {}

  Icon(locator: Locator): GridIcon {
    return new GridIcon(locator, this._ensureVisible);
  }

  async Action(): Promise<void> {}

  async PasteExcelData(): Promise<void> {}
}

export class GridHeader {
  _ensureVisible!: () => Promise<void>;
  constructor(locator: GridTable, ensureVisible: () => Promise<void>) {
    return Object.assign(locator, {
      _ensureVisible: ensureVisible,
      Icon: this.Icon,
    });
  }

  Icon(locator: Locator, ensureVisible: () => Promise<void>): GridIcon {
    return new GridIcon(locator, this._ensureVisible);
  }
}

export class GridTable {
  constructor(locator: Locator) {
    return Object.assign(locator, {
      _headerCache: null,
      InitHeaders: this.InitHeaders,
      Cell: this.Cell,
      Row: this.Row,
      Header: this.Header,
      FindRowIndexByValue: this.FindRowIndexByValue,
      scrollColumnIntoView: this.scrollColumnIntoView,
      getColumnIndex: this.getColumnIndex,
      tryGetCachedColumnIndex: this.tryGetCachedColumnIndex,
      pasteRowData: this.pasteRowData,
    });
  }

  Cell(this: GridTable, row: string, column: string): GridCell {
    return new GridCell(this, row, column, () =>
      this.scrollColumnIntoView(column),
    );
  }

  Row(this: GridTable, row: string | number): GridRow {
    return new GridRow(row);
  }

  Header(this: GridTable, column: string): GridHeader {
    return new GridHeader(this, () => this.scrollColumnIntoView(column));
  }

  async InitHeaders(): Promise<void> {}

  async FindRowIndexByValue(
    column: string,
    expectedValue: string,
  ): Promise<string> {
    const rowIndex: string = "";
    return rowIndex;
  }

  async scrollColumnIntoView(column: string): Promise<void> {}

  getColumnIndex(this: GridTable, columnName: string): number {
    return 0;
  }

  tryGetCachedColumnIndex(this: GridTable, columnName: string): number | null {
    return null;
  }

  async pasteRowData(
    this: GridTable,
    rowId: string,
    data: Record<string, string>,
  ): Promise<void> {}
}
