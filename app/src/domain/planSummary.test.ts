import { describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import { EMPTY_PROFILE } from "../types";
import { areasEmptiedByImport, summarizePlan } from "./planSummary";

describe("summarizePlan", () => {
  it("counts what the plan holds", () => {
    const profile = buildTestProfile({
      age: 45,
      retirementAge: 62,
      maritalStatus: "married",
      spouse: { age: 43 },
      pensionBalances: [100_000, 200_000],
      equity: [{ quantity: 10, priceUSD: 50 }],
      bankDeposits: [{ amount: 50_000 }, { amount: 20_000 }, { amount: 10_000 }],
      retirementMonthlyExpenses: 15_000,
    });

    expect(summarizePlan(profile)).toEqual({
      age: 45,
      retirementAge: 62,
      hasSpouse: true,
      pensionAccounts: 2,
      holdings: 1,
      bankDeposits: 3,
      expenseItems: 0,
      retirementMonthly: 15_000,
    });
  });

  it("is empty for a fresh profile", () => {
    expect(summarizePlan(EMPTY_PROFILE)).toEqual({
      age: null,
      retirementAge: null,
      hasSpouse: false,
      pensionAccounts: 0,
      holdings: 0,
      bankDeposits: 0,
      expenseItems: 0,
      retirementMonthly: null,
    });
  });

  it("does not count a spouse who is not in the plan", () => {
    expect(summarizePlan(buildTestProfile({ maritalStatus: "married" })).hasSpouse).toBe(false);
    expect(summarizePlan(buildTestProfile({ maritalStatus: "single", spouse: { age: 40 } })).hasSpouse).toBe(false);
  });

  it("sums itemised expenses into the desired monthly spending", () => {
    const profile = buildTestProfile({
      expenseItems: [
        { amount: 1_000, frequency: "monthly", necessity: "essential" },
        { amount: 2_400, frequency: "yearly", necessity: "discretionary" },
      ],
    });

    const summary = summarizePlan(profile);

    expect(summary.expenseItems).toBe(2);
    expect(summary.retirementMonthly).toBe(1_200);
  });
});

describe("areasEmptiedByImport", () => {
  const current = buildTestProfile({
    age: 45,
    pensionBalances: [100_000],
    equity: [{ quantity: 10, priceUSD: 50 }],
    bankDeposits: [{ amount: 50_000 }],
    retirementMonthlyExpenses: 15_000,
  });

  it("is empty when the file carries every part the current plan has data in", () => {
    expect(
      areasEmptiedByImport(current, [
        "personal",
        "spouse",
        "taxExemptionBasket",
        "bituachLeumi",
        "pensionSavings",
        "equity",
        "bankDeposits",
        "expenses",
        "assumptions",
      ]),
    ).toEqual([]);
  });

  it("names the areas with data that the file has nothing for", () => {
    expect(
      areasEmptiedByImport(current, ["personal", "spouse", "taxExemptionBasket", "bituachLeumi", "assumptions"]),
    ).toEqual(["pensionSavings", "equity", "bankDeposits", "expenses"]);
  });

  it("ignores missing parts the current plan has no data in", () => {
    expect(areasEmptiedByImport(EMPTY_PROFILE, ["personal"])).toEqual([]);
  });

  it("counts the personal area when only the spouse is missing", () => {
    const married = buildTestProfile({ maritalStatus: "married", spouse: { age: 40 } });

    expect(
      areasEmptiedByImport(married, ["personal", "taxExemptionBasket", "bituachLeumi"]),
    ).toEqual(["personal"]);
  });
});
