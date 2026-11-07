/** A cell of a CSV row: text, a number, or nothing. */
export type CsvCell = string | number | null | undefined;

const BYTE_ORDER_MARK = "\uFEFF";

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  const text = String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows as CSV text. It starts with a byte order mark so that Excel reads the file as UTF-8 and
 * shows Hebrew and Russian text correctly, and it uses CRLF line ends as the format expects.
 */
export function toCsv(rows: CsvCell[][]): string {
  return BYTE_ORDER_MARK + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
