import type { ExpenseItem, ExpensesData } from "../types";

const MONTHS_BETWEEN_PAYMENTS = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  yearly: 12,
} as const;

/** Months from one payment to the next; null while "every N years" has no usable N. */
export function monthsBetweenPayments(item: Pick<ExpenseItem, "frequency" | "everyYears">): number | null {
  if (item.frequency !== "everyYears") return MONTHS_BETWEEN_PAYMENTS[item.frequency];
  return item.everyYears !== null && item.everyYears > 0 ? item.everyYears * 12 : null;
}

/**
 * What the item costs per month on average: one payment spread over the months until the next.
 * An arnona bill of 1,800 every 2 months is 900; a 7,000 fridge every 10 years is about 58.
 * Zero while the amount, or the number of years, is missing.
 */
export function monthlyEquivalent(item: ExpenseItem): number {
  const months = monthsBetweenPayments(item);
  if (months === null || item.amount === null) return 0;
  return item.amount / months;
}

export interface ExpenseTotals {
  /** Essential items only: the minimum budget. */
  essential: number;
  discretionary: number;
  /** Everything: the desired budget. */
  total: number;
}

export function expenseTotals(items: readonly ExpenseItem[]): ExpenseTotals {
  let essential = 0;
  let discretionary = 0;
  for (const item of items) {
    if (item.necessity === "essential") essential += monthlyEquivalent(item);
    else discretionary += monthlyEquivalent(item);
  }
  return { essential, discretionary, total: essential + discretionary };
}

/**
 * The desired monthly spending in retirement, in today's money, that the plan is measured against:
 * the typed figure, or in detailed mode the sum of the items rounded to a whole shekel. Null while
 * nothing has been entered.
 */
export function desiredRetirementMonthly(expenses: ExpensesData): number | null {
  if (expenses.mode === "totals") return expenses.retirementMonthly;
  if (expenses.items.length === 0) return null;
  return Math.round(expenseTotals(expenses.items).total);
}
