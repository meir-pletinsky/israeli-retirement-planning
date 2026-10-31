import { describe, expect, it } from "vitest";

import { EXPENSE_SUGGESTIONS } from "../domain";
import { EXPENSE_CATEGORIES, EXPENSE_FREQUENCIES } from "../types";
import en from "./locales/en.json";
import he from "./locales/he.json";
import ru from "./locales/ru.json";

const LOCALES = { en, he, ru };

describe.each(Object.entries(LOCALES))("expense strings in %s", (_language, locale) => {
  const expenses = locale.myData.steps.expenses as Record<string, unknown> & {
    catalog: Record<string, string>;
    category: Record<string, string>;
    frequency: Record<string, string>;
  };

  it("names every suggestion", () => {
    for (const suggestion of EXPENSE_SUGGESTIONS) {
      expect(expenses.catalog[suggestion.key], suggestion.key).toBeTruthy();
    }
  });

  it("has no name for a suggestion that no longer exists", () => {
    const keys = new Set(EXPENSE_SUGGESTIONS.map((suggestion) => suggestion.key));
    expect(Object.keys(expenses.catalog).filter((key) => !keys.has(key))).toEqual([]);
  });

  it("names every category and every frequency", () => {
    for (const category of EXPENSE_CATEGORIES) expect(expenses.category[category], category).toBeTruthy();
    for (const frequency of EXPENSE_FREQUENCIES) expect(expenses.frequency[frequency], frequency).toBeTruthy();
  });

  it("no longer asks for today's expenses", () => {
    expect(expenses).not.toHaveProperty("currentMonthly");
  });

  it("has the forms of 'every N years' that the language needs", () => {
    expect(expenses.everyYearsCount_other).toBeTruthy();
  });
});
