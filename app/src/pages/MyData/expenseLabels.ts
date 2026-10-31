import type { TFunction } from "i18next";

import type { ExpenseItem } from "../../types";

export const EXPENSES = "myData.steps.expenses";

/** The name the user typed; for a suggestion left without one, its built-in name; else a placeholder. */
export function expenseName(item: ExpenseItem, t: TFunction): string {
  const fromCatalog = item.catalogKey
    ? t(`${EXPENSES}.catalog.${item.catalogKey}`, { defaultValue: "" })
    : "";
  return item.name.trim() || fromCatalog || t(`${EXPENSES}.untitled`);
}

export function expenseFrequencyLabel(
  item: Pick<ExpenseItem, "frequency" | "everyYears">,
  t: TFunction,
): string {
  if (item.frequency === "everyYears" && item.everyYears !== null && item.everyYears > 0) {
    return t(`${EXPENSES}.everyYearsCount`, { count: item.everyYears });
  }
  return t(`${EXPENSES}.frequency.${item.frequency}`);
}
