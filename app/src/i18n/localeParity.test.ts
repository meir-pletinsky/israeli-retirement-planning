import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";
import i18n from "./index";
import { PLURAL_SUFFIX, baseKey, localized } from "./localeTestUtils";

type Strings = { [key: string]: string | Strings };

function flatten(strings: Strings, prefix = ""): Record<string, string> {
  return Object.entries(strings).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const ENGLISH = flatten(en as unknown as Strings);
const ENGLISH_BASES = new Set(Object.keys(ENGLISH).map(baseKey));
const hasPlaceholdersToMatch = (key: string) => !PLURAL_SUFFIX.test(key) || key.endsWith("_other");

describe.each([
  ["he", he],
  ["ru", ru],
])("%s locale", (_language, locale) => {
  const strings = flatten(locale as unknown as Strings);

  it("has every key the English locale has", () => {
    expect(Object.keys(ENGLISH).filter((key) => !localized(strings, key))).toEqual([]);
  });

  it("has no key the English locale lacks", () => {
    expect(Object.keys(strings).filter((key) => !ENGLISH_BASES.has(baseKey(key)))).toEqual([]);
  });

  it("uses the same placeholders as the English text", () => {
    const mismatched = Object.entries(ENGLISH).filter(
      ([key, english]) =>
        hasPlaceholdersToMatch(key) &&
        JSON.stringify(placeholders(localized(strings, key) ?? "")) !== JSON.stringify(placeholders(english)),
    );
    expect(mismatched.map(([key]) => key)).toEqual([]);
  });

  it("gives every plural form of a text the same placeholders", () => {
    const keys = Object.keys(strings).filter((key) => PLURAL_SUFFIX.test(key));
    const inconsistent = keys.filter((key) => {
      const reference = new Set(placeholders(strings[`${baseKey(key)}_other`] ?? ""));
      return placeholders(strings[key]).some((name) => !reference.has(name));
    });
    expect(inconsistent).toEqual([]);
  });
});

// Russian counted nouns need a plural form (1 год, 2 года, 5 лет), so a text may not put a number
// placeholder straight in front of one. Calendar years and percentages ("60% акций") take a fixed form.
const COUNTED_NOUN = /\{\{(\w+)\}\}\s+(?:лет|год[а-я]*|месяц[а-я]*|акци[а-я]*|дн[а-я]+|недел[а-я]*|сч[её]т[а-я]*)(?![а-я])/g;
const NOT_COUNTS = new Set(["year", "finalYear", "startYear", "endYear", "stocks", "bonds"]);

describe("ru counted nouns", () => {
  const strings = flatten(ru as unknown as Strings);

  it("never follow a number placeholder in a text without plural forms", () => {
    const offenders = Object.entries(strings)
      .filter(([key]) => !PLURAL_SUFFIX.test(key))
      .filter(([, text]) => [...text.matchAll(COUNTED_NOUN)].some(([, placeholder]) => !NOT_COUNTS.has(placeholder)));
    expect(offenders.map(([key]) => key)).toEqual([]);
  });

  it("has a form for every Russian plural category wherever one is used", () => {
    const bases = new Set(Object.keys(strings).filter((key) => PLURAL_SUFFIX.test(key)).map(baseKey));
    const missing = [...bases].flatMap((base) =>
      ["one", "few", "many", "other"].filter((category) => !strings[`${base}_${category}`]).map((c) => `${base}_${c}`),
    );
    expect(missing).toEqual([]);
  });

  it("agrees the noun with the number when rendered", () => {
    const t = i18n.getFixedT("ru");
    const years = (count: number) => t("projections.cover.years", { years: String(count), count });
    expect([1, 2, 5, 11, 21, 24].map(years)).toEqual(["1 год", "2 года", "5 лет", "11 лет", "21 год", "24 года"]);
    expect(t("projections.cover.years", { years: "1.5", count: 1.5 })).toBe("1.5 года");
    expect([61, 62, 65, 71].map((count) => t("projections.compare.ageSuffix", { count }))).toEqual([
      "год",
      "года",
      "лет",
      "год",
    ]);
    const shares = (count: number) =>
      t("myData.steps.equity.splits.totalAsReported", { quantity: String(count), value: "X", count });
    expect([1, 3, 5].map(shares)).toEqual([
      "как в отчёте: 1 акция · X",
      "как в отчёте: 3 акции · X",
      "как в отчёте: 5 акций · X",
    ]);
  });
});

describe("he status banner", () => {
  const strings = flatten(he as unknown as Strings);

  it("is spelled correctly and addresses the household in the plural, like the rest of the Dashboard", () => {
    for (const key of ["dashboard.statusOnTrack", "dashboard.statusShortfall"]) {
      expect(strings[key], key).not.toContain("להשגאת");
      expect(strings[key], key).not.toMatch(/\bאתה\b|שלך/);
      expect(strings[key], key).toMatch(/שלכם/);
    }
  });
});
