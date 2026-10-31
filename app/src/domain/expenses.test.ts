import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { createEmptyExpenseItem, EXPENSE_CATEGORIES, type ExpenseItem, type ExpensesData } from "../types";
import { EXPENSE_SUGGESTIONS, itemFromSuggestion } from "./expenseCatalog";
import {
  desiredRetirementMonthly,
  expenseTotals,
  monthlyEquivalent,
  monthsBetweenPayments,
} from "./expenses";
import { calculateFundingGap } from "./fundingGap";

const item = (patch: Partial<ExpenseItem>): ExpenseItem => ({ ...createEmptyExpenseItem(), ...patch });

describe("monthsBetweenPayments", () => {
  it("counts the months from one payment to the next", () => {
    expect(monthsBetweenPayments(item({ frequency: "monthly" }))).toBe(1);
    expect(monthsBetweenPayments(item({ frequency: "bimonthly" }))).toBe(2);
    expect(monthsBetweenPayments(item({ frequency: "quarterly" }))).toBe(3);
    expect(monthsBetweenPayments(item({ frequency: "yearly" }))).toBe(12);
    expect(monthsBetweenPayments(item({ frequency: "everyYears", everyYears: 10 }))).toBe(120);
    expect(monthsBetweenPayments(item({ frequency: "everyYears", everyYears: 0.5 }))).toBe(6);
  });

  it("has no answer for every-few-years while the years are missing or not positive", () => {
    expect(monthsBetweenPayments(item({ frequency: "everyYears", everyYears: null }))).toBeNull();
    expect(monthsBetweenPayments(item({ frequency: "everyYears", everyYears: 0 }))).toBeNull();
    expect(monthsBetweenPayments(item({ frequency: "everyYears", everyYears: -3 }))).toBeNull();
  });
});

describe("monthlyEquivalent", () => {
  it("spreads one payment over the months until the next", () => {
    expect(monthlyEquivalent(item({ amount: 1_800, frequency: "bimonthly" }))).toBe(900);
    expect(monthlyEquivalent(item({ amount: 12_000, frequency: "yearly" }))).toBe(1_000);
    expect(monthlyEquivalent(item({ amount: 7_000, frequency: "everyYears", everyYears: 10 }))).toBeCloseTo(58.33, 2);
  });

  it("counts nothing while the amount or the years are missing", () => {
    expect(monthlyEquivalent(item({ amount: null }))).toBe(0);
    expect(monthlyEquivalent(item({ amount: 5_000, frequency: "everyYears", everyYears: null }))).toBe(0);
  });
});

describe("expenseTotals", () => {
  it("splits the essential minimum from the discretionary rest", () => {
    const totals = expenseTotals([
      item({ amount: 6_000, necessity: "essential" }),
      item({ amount: 1_800, frequency: "bimonthly", necessity: "essential" }),
      item({ amount: 12_000, frequency: "yearly", necessity: "discretionary" }),
      item({ amount: null, necessity: "discretionary" }),
    ]);
    expect(totals).toEqual({ essential: 6_900, discretionary: 1_000, total: 7_900 });
  });

  it("is zero for an empty list", () => {
    expect(expenseTotals([])).toEqual({ essential: 0, discretionary: 0, total: 0 });
  });
});

describe("desiredRetirementMonthly", () => {
  const base: ExpensesData = { mode: "totals", retirementMonthly: 9_000, items: [] };

  it("is the typed figure in one-total mode, even when items are kept", () => {
    expect(desiredRetirementMonthly(base)).toBe(9_000);
    expect(desiredRetirementMonthly({ ...base, items: [item({ amount: 100 })] })).toBe(9_000);
    expect(desiredRetirementMonthly({ ...base, retirementMonthly: null })).toBeNull();
  });

  it("is the whole list, rounded to a shekel, in itemised mode; the typed figure is ignored", () => {
    const expenses: ExpensesData = {
      ...base,
      mode: "detailed",
      items: [
        item({ amount: 1_000, necessity: "essential" }),
        item({ amount: 7_000, frequency: "everyYears", everyYears: 10, necessity: "discretionary" }),
      ],
    };
    expect(desiredRetirementMonthly(expenses)).toBe(1_058);
  });

  it("is unset for an itemised list with no items, so the plan does not take the typed figure", () => {
    expect(desiredRetirementMonthly({ ...base, mode: "detailed" })).toBeNull();
  });
});

describe("the funding gap uses the itemised total", () => {
  it("compares the income with the sum of the items", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
      expenseItems: [
        { amount: 300, frequency: "monthly", necessity: "essential" },
        { amount: 1_200, frequency: "yearly", necessity: "discretionary" },
      ],
    });
    const result = calculateFundingGap(profile);
    expect(result.desiredMonthlyExpenses).toBe(400);
    expect(result.estimatedMonthlyIncome).toBe(435);
    expect(result.monthlyGap).toBe(35);
  });

  it("does not use the typed figure while itemised mode is on", () => {
    const profile = buildTestProfile({
      age: 67,
      retirementAge: 67,
      pensionBalances: [120_000],
      retirementMonthlyExpenses: 50_000,
      expenseItems: [{ amount: 100 }],
    });
    expect(calculateFundingGap(profile).desiredMonthlyExpenses).toBe(100);
  });
});

describe("the suggestion catalog", () => {
  it("has unique keys, and every one belongs to a known category", () => {
    const keys = EXPENSE_SUGGESTIONS.map((suggestion) => suggestion.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const suggestion of EXPENSE_SUGGESTIONS) {
      expect(EXPENSE_CATEGORIES, suggestion.key).toContain(suggestion.category);
    }
  });

  it("gives every every-few-years suggestion a number of years", () => {
    for (const suggestion of EXPENSE_SUGGESTIONS) {
      if (suggestion.frequency === "everyYears") {
        expect(suggestion.everyYears, suggestion.key).toBeGreaterThan(0);
      } else {
        expect(suggestion.everyYears, suggestion.key).toBeUndefined();
      }
    }
  });

  it("turns a suggestion into a list item with the typed amount and no fixed name", () => {
    const fridge = EXPENSE_SUGGESTIONS.find((suggestion) => suggestion.key === "appliances");
    if (!fridge) throw new Error("appliances suggestion is missing");
    const added = itemFromSuggestion(fridge, 7_000);
    expect(added).toMatchObject({
      catalogKey: "appliances",
      name: "",
      category: "housing",
      amount: 7_000,
      frequency: "everyYears",
      everyYears: 10,
      necessity: "essential",
      notes: "",
    });
    expect(added.id).not.toBe(itemFromSuggestion(fridge, null).id);
    expect(itemFromSuggestion(fridge, null).amount).toBeNull();
  });
});
