import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";

type Strings = { [key: string]: string | Strings };

function flatten(strings: Strings, prefix = ""): Record<string, string> {
  return Object.entries(strings).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

// Plural forms differ per language: Hebrew and Russian have more of them than English, and a
// "one" form may leave out the count.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKey = (key: string) => key.replace(PLURAL_SUFFIX, "");
const ENGLISH = flatten(en as unknown as Strings);
const ENGLISH_BASES = new Set(Object.keys(ENGLISH).map(baseKey));
const hasPlaceholdersToMatch = (key: string) => !PLURAL_SUFFIX.test(key) || key.endsWith("_other");

describe.each([
  ["he", he],
  ["ru", ru],
])("%s locale", (_language, locale) => {
  const strings = flatten(locale as unknown as Strings);

  it("has every key the English locale has", () => {
    expect(Object.keys(ENGLISH).filter((key) => !strings[key])).toEqual([]);
  });

  it("has no key the English locale lacks", () => {
    expect(Object.keys(strings).filter((key) => !ENGLISH_BASES.has(baseKey(key)))).toEqual([]);
  });

  it("uses the same placeholders as the English text", () => {
    const mismatched = Object.entries(ENGLISH).filter(
      ([key, english]) =>
        hasPlaceholdersToMatch(key) &&
        JSON.stringify(placeholders(strings[key] ?? "")) !== JSON.stringify(placeholders(english)),
    );
    expect(mismatched.map(([key]) => key)).toEqual([]);
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
