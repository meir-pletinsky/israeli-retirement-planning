import { describe, expect, it } from "vitest";

import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";

const LOCALES = { en, he, ru };

type Strings = { [key: string]: string | Strings };

function flatten(strings: Strings, prefix = ""): Record<string, string> {
  return Object.entries(strings).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) };
  }, {});
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const ENGLISH = {
  ...flatten(en.dashboard.snapshot, "dashboard.snapshot"),
  ...flatten(en.dashboard.retireChecks, "dashboard.retireChecks"),
};

describe.each(Object.entries(LOCALES))("dashboard retirement KPI strings in %s", (_language, locale) => {
  const strings = flatten(locale as unknown as Strings);

  it("has every key the English text has", () => {
    for (const key of Object.keys(ENGLISH)) expect(strings[key], key).toBeTruthy();
  });

  it("uses the same placeholders as the English text", () => {
    for (const [key, english] of Object.entries(ENGLISH)) {
      expect(placeholders(strings[key] ?? ""), key).toEqual(placeholders(english));
    }
  });
});
