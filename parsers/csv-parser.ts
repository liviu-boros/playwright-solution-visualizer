export class CsvParser {
  constructor(public readonly delimiter: string = ',') {}

  parse(input: string): Record<string, string>[] {
    const lines = input
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length < 2) return [];

    const headers = lines[0].split(this.delimiter).map(header => header.trim());
    return lines.slice(1).map(line => {
      const values = line.split(this.delimiter).map(value => value.trim());
      return headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = values[index] ?? '';
        return row;
      }, {});
    });
  }
}
