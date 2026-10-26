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

  describe("feasibility card", () => {
    // 0% real return keeps the expected ages exact (see feasibility.test.ts).
    const zeroRealReturn = { investmentReturnPct: 4, inflationPct: 4 };

    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    it("shows the earliest feasible age and years from today", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          otherAssets: 3_000_000,
          retirementMonthlyExpenses: 6000,
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Earliest Feasible Retirement")).toBeInTheDocument();
      expect(screen.getByText("Age 49")).toBeInTheDocument();
      expect(screen.getByText("Years from today: 9")).toBeInTheDocument();
    });

    it("says retirement is feasible now when assets already cover the target", async () => {
      await seed(
        buildTestProfile({
          age: 50,
          otherAssets: 5_000_000,
          retirementMonthlyExpenses: 6000,
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Age 50")).toBeInTheDocument();
      expect(screen.getByText(/already cover your target retirement spending/i)).toBeInTheDocument();
    });

    it("explains when the target isn't reachable", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          otherAssets: 100_000,
          retirementMonthlyExpenses: 20_000,
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText(/isn't reachable by age 80/i)).toBeInTheDocument();
    });

    it("prompts for expenses when no target is set", async () => {
      await seed(buildTestProfile({ age: 40, otherAssets: 1_000_000, ...zeroRealReturn }));

      renderWithProviders(<Dashboard />);

      const link = await screen.findByRole("link", { name: "Add expenses" });
      expect(link).toHaveAttribute("href", "/my-data/expenses");
    });
  });
});
