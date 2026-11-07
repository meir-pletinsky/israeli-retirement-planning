/**
 * Dates are stored as ISO text (yyyy-mm-dd) and shown to the user day first, as dd/mm/yyyy.
 */

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function monthFromName(word: string): number | null {
  const name = word.toLowerCase();
  if (name === "sept") return 9;
  const index = MONTH_NAMES.findIndex((full) => full === name || (name.length === 3 && full.startsWith(name)));
  return index < 0 ? null : index + 1;
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

/** The ISO date of a calendar day, or null when the day does not exist or the year is implausible. */
export function isoFromParts(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger)) return null;
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** An ISO date as dd/mm/yyyy (or with another separator); anything that is not an ISO date is returned unchanged. */
export function formatDate(iso: string, separator = "/"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}${separator}${match[2]}${separator}${match[1]}` : iso;
}

/** The calendar day of an ISO timestamp as dd/mm/yyyy in the viewer's time zone; "" if unreadable. */
export function formatLocalDate(isoTimestamp: string, separator = "/"): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()]
    .map((part, index) => pad(part, index === 2 ? 4 : 2))
    .join(separator);
}

export interface ParseDateOptions {
  /** Accept years written with two digits (24 is 2024, 70 is 1970). */
  twoDigitYear?: boolean;
}

function expandYear(text: string, options: ParseDateOptions): number | null {
  if (text.length === 4) return Number(text);
  if (text.length === 2 && options.twoDigitYear) {
    const short = Number(text);
    return short < 70 ? 2000 + short : 1900 + short;
  }
  return null;
}

// A time of day after the date ("2024-03-01T10:00:00Z", "01/03/2024 14:30") is ignored.
const TIME_SUFFIX = /[T\s]+\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2}|[AP]M)?$/i;

/**
 * Reads a date written in almost any common way and returns it as an ISO date, or null when it
 * is not a real date. A date with numbers only is read day first (01/03/2024 is 1 March), unless
 * the second number can only be a day (03/25/2024). Month names in English are understood, too.
 */
export function parseDate(input: string, options: ParseDateOptions = {}): string | null {
  const text = input.trim().replace(TIME_SUFFIX, "").replace(/\.$/, "").trim();
  if (text === "") return null;

  const numeric = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(text);
  if (numeric) {
    const [, first, second, third] = numeric;
    if (first.length === 4) return isoFromParts(Number(first), Number(second), Number(third));
    const year = expandYear(third, options);
    if (year === null || first.length > 2) return null;
    const monthFirst = Number(second) > 12 && Number(first) <= 12;
    return monthFirst
      ? isoFromParts(year, Number(first), Number(second))
      : isoFromParts(year, Number(second), Number(first));
  }

  if (/^\d{8}$/.test(text)) {
    const startsWithYear = /^(19|20)/.test(text);
    const asYearFirst = isoFromParts(
      Number(text.slice(0, 4)),
      Number(text.slice(4, 6)),
      Number(text.slice(6, 8)),
    );
    if (startsWithYear && asYearFirst) return asYearFirst;
    return isoFromParts(Number(text.slice(4, 8)), Number(text.slice(2, 4)), Number(text.slice(0, 2)));
  }

  const separator = "[\\s/.,-]*";
  const dayFirst = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?${separator}([A-Za-z]{3,9})\\.?${separator}(\\d{4}|\\d{2})$`).exec(text);
  if (dayFirst) {
    const month = monthFromName(dayFirst[2]);
    const year = expandYear(dayFirst[3], options);
    return month && year ? isoFromParts(year, month, Number(dayFirst[1])) : null;
  }

  const monthFirst = new RegExp(`^([A-Za-z]{3,9})\\.?${separator}(\\d{1,2})(?:st|nd|rd|th)?[\\s/.,-]+(\\d{4}|\\d{2})$`).exec(text);
  if (monthFirst) {
    const month = monthFromName(monthFirst[1]);
    const year = expandYear(monthFirst[3], options);
    return month && year ? isoFromParts(year, month, Number(monthFirst[2])) : null;
  }

  const yearFirst = new RegExp(`^(\\d{4})${separator}([A-Za-z]{3,9})\\.?${separator}(\\d{1,2})$`).exec(text);
  if (yearFirst) {
    const month = monthFromName(yearFirst[2]);
    return month ? isoFromParts(Number(yearFirst[1]), month, Number(yearFirst[3])) : null;
  }

  return null;
}

/** True when the text is a whole date in the app's own formats (dd/mm/yyyy or yyyy-mm-dd), not a half-typed one. */
export function isCompleteDateText(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{2}[/.-]\d{2}[/.-]\d{4}$/.test(text);
}
