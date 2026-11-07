import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseItem,
  type ExpenseNecessity,
  type ExpensesData,
} from "../types";
import { roundToSum } from "./rounding";

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

export interface BudgetCategoryRow {
  category: ExpenseCategory;
  essential: number;
  discretionary: number;
}

/** The itemised budget in whole shekels per month, split by necessity and by category. */
export interface BudgetBreakdown {
  /** The minimum budget: the essential items. */
  essential: number;
  discretionary: number;
  /** Everything; the same figure as `desiredRetirementMonthly`. */
  total: number;
  /** The categories that have spending, the largest first. */
  categories: BudgetCategoryRow[];
}

/**
 * The itemised budget, split into the essential minimum and the discretionary rest and by
 * category, rounded so the parts add up to the planned total. Null in one-total mode and while no
 * item has an amount: there is nothing to split.
 */
export function budgetBreakdown(expenses: ExpensesData): BudgetBreakdown | null {
  if (expenses.mode !== "detailed") return null;

  const total = Math.round(expenseTotals(expenses.items).total);
  if (total <= 0) return null;

  const cells = EXPENSE_CATEGORIES.flatMap((category) => {
    const inCategory = expenses.items.filter((item) => item.category === category);
    const sum = (necessity: ExpenseNecessity) =>
      inCategory
        .filter((item) => (item.necessity === "essential") === (necessity === "essential"))
        .reduce((subtotal, item) => subtotal + monthlyEquivalent(item), 0);
    return [
      { category, necessity: "essential" as const, amount: sum("essential") },
      { category, necessity: "discretionary" as const, amount: sum("discretionary") },
    ];
  });
  const rounded = roundToSum(
    cells.map((cell) => cell.amount),
    total,
  );

  const rows = new Map<ExpenseCategory, BudgetCategoryRow>();
  cells.forEach((cell, index) => {
    if (rounded[index] === 0) return;
    const row = rows.get(cell.category) ?? { category: cell.category, essential: 0, discretionary: 0 };
    row[cell.necessity] += rounded[index];
    rows.set(cell.category, row);
  });
  const categories = [...rows.values()].sort(
    (a, b) => b.essential + b.discretionary - (a.essential + a.discretionary),
  );
  const essential = categories.reduce((sum, row) => sum + row.essential, 0);
  return { essential, discretionary: total - essential, total, categories };
}

/**
 * Whether there is a retirement budget to show: an itemised list with amounts, or one typed
 * monthly total (which has no split, so it can only ask to itemise).
 */
export function hasRetirementBudget(expenses: ExpensesData): boolean {
  if (budgetBreakdown(expenses)) return true;
  return expenses.mode === "totals" && (expenses.retirementMonthly ?? 0) > 0;
}

/** A payment made once a year or less often is irregular: it is lumpy rather than a running cost. */
export const IRREGULAR_MIN_MONTHS = 12;

export interface IrregularCost {
  item: ExpenseItem;
  /** One payment, in shekels. */
  amount: number;
  /** Months from one payment to the next. */
  months: number;
  /** What it adds to the monthly average, in whole shekels. */
  monthly: number;
}

export interface IrregularCosts {
  /** The irregular items, the biggest monthly share first. */
  items: IrregularCost[];
  /** What they add to the monthly average, in whole shekels; the rows add up to it. */
  monthly: number;
  /** The share of the planned monthly spending, 0 to 1. */
  share: number;
  /** The single biggest payment: the cash needed at once when it falls due. */
  largest: IrregularCost;
}

/**
 * The itemised expenses that are paid once a year or less often, which the monthly average hides:
 * how much each is, how often, and what it adds to the average. Null in one-total mode and while
 * the list has no such item. It knows nothing of due dates; the inputs do not capture them.
 */
export function irregularCosts(expenses: ExpensesData): IrregularCosts | null {
  if (expenses.mode !== "detailed") return null;

  const irregular = expenses.items.flatMap((item) => {
    const months = monthsBetweenPayments(item);
    if (months === null || months < IRREGULAR_MIN_MONTHS || item.amount === null || item.amount <= 0) return [];
    return [{ item, amount: item.amount, months, exact: monthlyEquivalent(item) }];
  });
  if (irregular.length === 0) return null;

  const exactSum = irregular.reduce((sum, row) => sum + row.exact, 0);
  const monthly = Math.round(exactSum);
  const rounded = roundToSum(
    irregular.map((row) => row.exact),
    monthly,
  );
  const items = irregular
    .map(({ item, amount, months }, index) => ({ item, amount, months, monthly: rounded[index] }))
    .sort((a, b) => b.monthly - a.monthly);
  const largest = items.reduce((best, row) => (row.amount > best.amount ? row : best), items[0]);
  const total = expenseTotals(expenses.items).total;
  return { items, monthly, share: total > 0 ? exactSum / total : 0, largest };
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
