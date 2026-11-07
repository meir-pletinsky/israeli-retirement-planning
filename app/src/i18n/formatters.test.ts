import { describe, expect, it } from "vitest";

import {
  datePlaceholder,
  formatAxisMoney,
  formatDate,
  formatFixed,
  formatLanguage,
  formatLocalDate,
  formatNumber,
} from "./formatters";

describe("formatLanguage", () => {
  it("reads a language code and falls back to English", () => {
    expect(formatLanguage("ru")).toBe("ru");
    expect(formatLanguage("ru-RU")).toBe("ru");
    expect(formatLanguage("he")).toBe("he");
    expect(formatLanguage("fr")).toBe("en");
    expect(formatLanguage("")).toBe("en");
  });
});

describe("formatNumber", () => {
  it("groups and separates decimals like the language", () => {
    expect(formatNumber(1234567.891, undefined, "en")).toBe("1,234,567.891");
    expect(formatNumber(1234567.891, undefined, "ru")).toBe("1\u00a0234\u00a0567,891");
    expect(formatNumber(1234567.891, undefined, "he")).toBe("1,234,567.891");
  });

  it("follows the active language when none is given", () => {
    expect(formatNumber(1234)).toBe("1,234");
  });

  it("adds no direction marks to a negative Hebrew number", () => {
    expect(formatNumber(-5, undefined, "he")).toBe("-5");
  });
});

describe("formatFixed", () => {
  it.each([
    ["en", "12.4"],
    ["ru", "12,4"],
    ["he", "12.4"],
  ])("writes one decimal in %s as %s", (language, expected) => {
    expect(formatFixed(12.44, 1, language)).toBe(expected);
  });

  it("keeps trailing zeros", () => {
    expect(formatFixed(6, 1, "ru")).toBe("6,0");
    expect(formatFixed(3.194, 3, "en")).toBe("3.194");
  });
});

describe("formatDate", () => {
  it.each([
    ["en", "06/11/2026"],
    ["ru", "06.11.2026"],
    ["he", "06/11/2026"],
  ])("writes an ISO date day first in %s as %s", (language, expected) => {
    expect(formatDate("2026-11-06", language)).toBe(expected);
  });

  it("returns text that is not an ISO date unchanged", () => {
    expect(formatDate("soon", "ru")).toBe("soon");
  });

  it("writes the day of a timestamp with the same separator", () => {
    expect(formatLocalDate("2026-11-06T12:00:00", "ru")).toBe("06.11.2026");
    expect(formatLocalDate("2026-11-06T12:00:00", "en")).toBe("06/11/2026");
    expect(formatLocalDate("not a date", "ru")).toBe("");
  });

  it("suits the placeholder of a date field to the language", () => {
    expect(datePlaceholder("en")).toBe("dd/mm/yyyy");
    expect(datePlaceholder("ru")).toBe("дд.мм.гггг");
  });
});

describe("formatAxisMoney", () => {
  it.each([
    [0, "₪0"],
    [950, "₪950"],
    [1_000, "₪1k"],
    [2_500, "₪2.5k"],
    [10_000, "₪10k"],
    [12_345, "₪12k"],
    [250_000, "₪250k"],
    [999_400, "₪999k"],
    [999_500, "₪1M"],
    [1_000_000, "₪1M"],
    [1_500_000, "₪1.5M"],
    [12_400_000, "₪12M"],
  ])("formats %d as %s in English", (value, expected) => {
    expect(formatAxisMoney(value, "₪", "en")).toBe(expected);
  });

  it("keeps the sign of a negative amount", () => {
    expect(formatAxisMoney(-2_500, "₪", "en")).toBe("-₪2.5k");
    expect(formatAxisMoney(-400, "₪", "en")).toBe("-₪400");
  });

  it.each([
    [950, "₪950"],
    [2_500, "₪2,5\u00a0тыс."],
    [24_000, "₪24\u00a0тыс."],
    [6_000_000, "₪6\u00a0млн"],
    [2_500_000, "₪2,5\u00a0млн"],
    [-2_500, "-₪2,5\u00a0тыс."],
  ])("formats %d as %s in Russian", (value, expected) => {
    expect(formatAxisMoney(value, "₪", "ru")).toBe(expected);
  });

  it("uses Hebrew unit words in Hebrew", () => {
    expect(formatAxisMoney(2_500, "₪", "he")).toBe("₪2.5\u00a0אלף");
    expect(formatAxisMoney(6_000_000, "₪", "he")).toBe("₪6\u00a0מיל׳");
  });
});
