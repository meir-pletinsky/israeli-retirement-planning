import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  aggregateCurrentNetWorth,
  calculateFundingGap,
  estimateRetirementIncome,
  yearsToRetirement,
} from "../domain";
import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { Dashboard } from "./Dashboard";

beforeEach(async () => {
  await clearAllData();
});

describe("Dashboard", () => {
  it("shows the empty state before onboarding completes", async () => {
    renderWithProviders(<Dashboard />);

    expect(
      await screen.findByText("Complete your profile to see your personalized retirement projection."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start my data/i })).toBeInTheDocument();
  });

  it("renders domain-engine-calculated KPIs once a profile exists", async () => {
    const profile = buildTestProfile({
      age: 45,
      retirementAge: 67,
      otherAssets: 200000,
      retirementMonthlyExpenses: 6000,
      investmentReturnPct: 4,
      inflationPct: 4,
    });
    await saveProfileToDb(profile);
    await saveOnboardedToDb(true);

    // Compute expectations the same way the component does, rather than
    // hardcoding numbers, so this test tracks the domain engine's actual
    // behavior instead of a snapshot that could silently drift.
    const netWorthToday = Math.round(aggregateCurrentNetWorth(profile));
    const { monthlyIncomeTodayMoney } = estimateRetirementIncome(
      profile,
      "standard",
    );
    const fundingGap = calculateFundingGap(profile, "standard");
    const years = yearsToRetirement(profile, "standard");

    renderWithProviders(<Dashboard />);

    expect(
      await screen.findByText(`\u20aa${netWorthToday.toLocaleString()}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`\u20aa${monthlyIncomeTodayMoney.toLocaleString()}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`\u20aa${fundingGap.monthlyGap.toLocaleString()}`),
    ).toBeInTheDocument();
    expect(screen.getByText(String(years))).toBeInTheDocument();
  });
});
