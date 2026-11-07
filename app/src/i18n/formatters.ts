import i18n from "i18next";

import { formatDate as formatIsoDate, formatLocalDate as formatLocalIsoDate } from "../domain/dates";

/**
 * Numbers, percentages and dates as the chosen app language writes them, not as the browser is
 * set: a Russian reader gets "1 234,5" and "06.11.2026" even in an English browser. Every screen
 * formats through these functions; `toLocaleString()` without a language and `toFixed` do not
 * follow the app language.
 */

type FormatLanguage = "en" | "ru" | "he";

// Hebrew writes numbers like English ("1,234.5"); the Hebrew locale itself adds invisible
// direction marks to negative numbers, which the screens' own sign handling does not expect.
const NUMBER_LOCALE: Record<FormatLanguage, string> = { en: "en-US", ru: "ru-RU", he: "en-US" };

const DATE_SEPARATOR: Record<FormatLanguage, string> = { en: "/", ru: ".", he: "/" };

const DATE_PLACEHOLDER: Record<FormatLanguage, string> = {
  en: "dd/mm/yyyy",
  ru: "дд.мм.гггг",
  he: "dd/mm/yyyy",
};

const AXIS_UNITS: Record<FormatLanguage, { thousand: string; million: string }> = {
  en: { thousand: "k", million: "M" },
  ru: { thousand: "\u00a0тыс.", million: "\u00a0млн" },
  he: { thousand: "\u00a0אלף", million: "\u00a0מיל׳" },
};

/** The supported language a code such as "ru" or "ru-RU" stands for; English for anything else. */
export function formatLanguage(language: string | undefined = i18n.language): FormatLanguage {
  const code = (language ?? "en").slice(0, 2);
  return code === "ru" || code === "he" ? code : "en";
}

/** A number with the grouping and decimal marks of the app language. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  language?: string,
): string {
  return value.toLocaleString(NUMBER_LOCALE[formatLanguage(language)], options);
}

/** A number with exactly `digits` decimals ("12.4", "12,4" in Russian); the display form of `toFixed`. */
export function formatFixed(value: number, digits: number, language?: string): string {
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits }, language);
}

/** An ISO date (yyyy-mm-dd) day first, with the separator of the app language: 06/11/2026, 06.11.2026. */
export function formatDate(iso: string, language?: string): string {
  return formatIsoDate(iso, DATE_SEPARATOR[formatLanguage(language)]);
}

/** The calendar day of an ISO timestamp in the viewer's time zone, written like `formatDate`. */
export function formatLocalDate(isoTimestamp: string, language?: string): string {
  return formatLocalIsoDate(isoTimestamp, DATE_SEPARATOR[formatLanguage(language)]);
}

/** What a date field shows while it is empty. */
export function datePlaceholder(language?: string): string {
  return DATE_PLACEHOLDER[formatLanguage(language)];
}

/** One decimal below 10 ("1.5", "2") and none from 10 up ("12"), for the short axis labels. */
function compact(value: number, language: string): string {
  if (value < 10) return formatNumber(Number(value.toFixed(1)), undefined, language);
  return formatNumber(Math.round(value), { useGrouping: false }, language);
}

/** Short money label for a chart axis: ₪950, ₪2.5k, ₪10k, ₪1.5M; "₪2,5 тыс.", "₪6 млн" in Russian. */
export function formatAxisMoney(value: number, currencySymbol: string, language?: string): string {
  const code = formatLanguage(language);
  const units = AXIS_UNITS[code];
  const sign = value < 0 ? "-" : "";
  const amount = Math.abs(value);

  if (amount >= 999_500) return `${sign}${currencySymbol}${compact(amount / 1_000_000, code)}${units.million}`;
  if (amount >= 1_000) return `${sign}${currencySymbol}${compact(amount / 1_000, code)}${units.thousand}`;
  return `${sign}${currencySymbol}${Math.round(amount)}`;
}
