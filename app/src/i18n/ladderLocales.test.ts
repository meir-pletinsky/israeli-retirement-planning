import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";
import { localized, sameBaseKeys } from "./localeTestUtils";

const LOCALES = { en, he, ru };

type Strings = { [key: string]: string | Strings };

function flatten(strings: Strings, prefix = ""): Record<string, string> {
  return Object.entries(strings).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const ENGLISH = flatten(en.projections.ladder, "projections.ladder");

describe.each(Object.entries(LOCALES))("liquidity ladder strings in %s", (_language, locale) => {
  const strings = flatten(locale as unknown as Strings);

  it("has every key the English text has", () => {
    expect(Object.keys(ENGLISH).length).toBeGreaterThan(15);
    for (const key of Object.keys(ENGLISH)) expect(localized(strings, key), key).toBeTruthy();
  });

  it("has no keys the English text lacks", () => {
    const own = Object.keys(flatten(locale.projections.ladder as unknown as Strings, "projections.ladder"));
    expect(sameBaseKeys(own, Object.keys(ENGLISH))).toEqual([]);
  });

  it("uses the same placeholders as the English text", () => {
    for (const [key, english] of Object.entries(ENGLISH)) {
      expect(placeholders(localized(strings, key) ?? ""), key).toEqual(placeholders(english));
    }
  });
});
