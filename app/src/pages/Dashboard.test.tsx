import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  aggregateCurrentNetWorth,
  calculateFundingGap,
  calculateRetirementKpis,
  checkRetirementAges,
  estimateNetIncome,
  estimateRetirementIncome,
  yearsToRetirement,
} from "../domain";
import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { createCoverPlan } from "../types";
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
    const { netMonthlyIncome } = estimateNetIncome(profile, "standard");
    const fundingGap = calculateFundingGap(profile, "standard");
    const years = yearsToRetirement(profile, "standard");

    renderWithProviders(<Dashboard />);

    const netWorthKpi = (await screen.findByText("Net Worth Today")).parentElement as HTMLElement;
    expect(
      within(netWorthKpi).getByText(`\u20aa${netWorthToday.toLocaleString()}`),
    ).toBeInTheDocument();
    const incomeKpi = screen.getByText("Projected Monthly Income After Tax").parentElement;
    expect(
      within(incomeKpi as HTMLElement).getByText(`\u20aa${netMonthlyIncome.toLocaleString()}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`\u20aa${Math.abs(fundingGap.monthlyGap).toLocaleString()}`),
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

  describe("source access card", () => {
    const zeroRealReturn = { investmentReturnPct: 4, inflationPct: 4 };

    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    it("stays hidden when every saving is accessible", async () => {
      await seed(
        buildTestProfile({ age: 40, retirementAge: 67, otherAssets: 500_000, ...zeroRealReturn }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Net Worth Today")).toBeInTheDocument();
      expect(screen.queryByText("Access to your savings")).not.toBeInTheDocument();
    });

    it("explains the locked pension and the income it limits", async () => {
      const profile = buildTestProfile({
        age: 55,
        retirementAge: 55,
        otherAssets: 60_000,
        pensionBalances: [600_000],
        pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
        ...zeroRealReturn,
      });
      await seed(profile);
      const { unconstrainedMonthlyIncome } = estimateRetirementIncome(profile, "standard").access;

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Access to your savings")).toBeInTheDocument();
      expect(screen.getByText("Available at retirement: \u20aa60,000")).toBeInTheDocument();
      expect(screen.getByText("Locked until age 60: \u20aa600,000")).toBeInTheDocument();
      expect(
        screen.getByText(
          `Until age 60 only part of your savings is accessible, which limits your sustainable income. If all your savings were available it would be \u20aa${unconstrainedMonthlyIncome.toLocaleString()} per month.`,
        ),
      ).toBeInTheDocument();
    });

    it("lists accounts that pay an annuity", async () => {
      const profile = buildTestProfile({
        age: 60,
        retirementAge: 65,
        pensionBalances: [500_000],
        pensionAccountOverrides: [
          {
            productCategory: "comprehensivePension",
            accountStatus: "payingAnnuity",
            annuityParameters: {
              hasGuaranteedFactor: false,
              conversionFactor: null,
              estimatedMonthlyAnnuity: 3000,
              annuityTaxType: null,
              guaranteedPaymentMonths: null,
            },
          },
        ],
        ...zeroRealReturn,
      });
      await seed(profile);
      const { accountAnnuityMonthly } = estimateRetirementIncome(profile, "standard").access;

      renderWithProviders(<Dashboard />);

      expect(accountAnnuityMonthly).toBe(3000);
      expect(
        await screen.findByText(
          "Accounts paying a monthly annuity: \u20aa3,000 (included in your income)",
        ),
      ).toBeInTheDocument();
    });

    it("no longer repeats the uncategorized-accounts note here (it is in the estimate card)", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          pensionBalances: [100_000],
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      await screen.findByText("Improve your estimate");
      expect(screen.queryByRole("heading", { name: "Access to your savings" })).not.toBeInTheDocument();
    });
  });

  describe("improve-your-estimate card", () => {
    const zeroRealReturn = { investmentReturnPct: 4, inflationPct: 4 };

    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    it("lists the missing optional inputs with a link to each step", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          pensionBalances: [100_000],
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      const card = (await screen.findByRole("heading", { name: "Improve your estimate" })).closest("section")!;
      expect(within(card).getByText(/Accounts without a product type: 1\./)).toBeInTheDocument();
      expect(within(card).getByText(/Accounts without a status: 1\./)).toBeInTheDocument();
      expect(within(card).getByText(/No expected retirement spending/)).toBeInTheDocument();
      expect(within(card).getByText(/Gender is not set/)).toBeInTheDocument();
      expect(within(card).getAllByRole("link", { name: "Open Pension & Savings" })[0]).toHaveAttribute(
        "href",
        "/my-data/pension-savings",
      );
      expect(within(card).getByRole("link", { name: "Open Expenses" })).toHaveAttribute(
        "href",
        "/my-data/expenses",
      );
      expect(within(card).getAllByRole("link", { name: "Open Personal" })[0]).toHaveAttribute(
        "href",
        "/my-data/personal",
      );
    });

    it("is hidden when nothing optional is missing", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          gender: "female",
          retirementAge: 67,
          retirementMonthlyExpenses: 6000,
          maritalStatus: "single",
          pensionBalances: [100_000],
          pensionAccountOverrides: [{ productCategory: "pensionFund", accountStatus: "inactive" }],
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(screen.queryByRole("heading", { name: "Improve your estimate" })).not.toBeInTheDocument();
    });

    it("shows no funding gap or status message until retirement spending is entered", async () => {
      await seed(buildTestProfile({ age: 40, retirementAge: 67, pensionBalances: [100_000], ...zeroRealReturn }));

      renderWithProviders(<Dashboard />);

      const gapKpi = (await screen.findByText("Monthly surplus or shortfall")).parentElement as HTMLElement;
      expect(within(gapKpi).getByText("—")).toBeInTheDocument();
      expect(within(gapKpi).getByText("Enter your planned spending to see this.")).toBeInTheDocument();
      expect(screen.queryByText("You're on track to meet your retirement goal.")).not.toBeInTheDocument();
      expect(screen.queryByText("You may need additional savings to meet your retirement goal.")).not.toBeInTheDocument();
    });

    it("shows the funding gap and status once spending is entered", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          retirementMonthlyExpenses: 1_000_000,
          pensionBalances: [100_000],
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(
        await screen.findByText("You may need additional savings to meet your retirement goal."),
      ).toBeInTheDocument();
      const gapKpi = screen.getByText("Monthly shortfall").parentElement as HTMLElement;
      expect(within(gapKpi).queryByText("—")).not.toBeInTheDocument();
      // The sign is said in words, and the amount is not shown with a minus.
      expect(within(gapKpi).getByText("short of your planned spending each month")).toBeInTheDocument();
      expect(within(gapKpi).getByText(/^\u20aa[\d,]+$/)).toBeInTheDocument();
    });

    it("calls an excess of income over spending a surplus, not a gap", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          retirementMonthlyExpenses: 1_000,
          otherAssets: 5_000_000,
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      const gapKpi = (await screen.findByText("Monthly surplus")).parentElement as HTMLElement;
      expect(within(gapKpi).getByText("to spare each month after your planned spending")).toBeInTheDocument();
      expect(screen.queryByText(/Funding Gap/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Monthly shortfall")).not.toBeInTheDocument();
    });

    it("shows the simulated spending coverage only once spending is entered", async () => {
      await seed(buildTestProfile({ age: 40, retirementAge: 67, pensionBalances: [100_000], ...zeroRealReturn }));

      const { unmount } = renderWithProviders(<Dashboard />);

      const emptyKpi = (await screen.findByText("Simulated spending coverage to age 90")).parentElement as HTMLElement;
      expect(within(emptyKpi).getByText("—")).toBeInTheDocument();
      unmount();

      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          gender: "male",
          monthlyGrossSalary: 20_000,
          retirementMonthlyExpenses: 1_500,
          pensionBalances: [900_000, 300_000],
          investmentReturnPct: 5,
          inflationPct: 2,
        }),
      );
      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Simulated spending coverage to age 90")).parentElement as HTMLElement;
      expect(within(kpi).getByText(/^\d+%$/)).toBeInTheDocument();
      expect(within(kpi).queryByText("—")).not.toBeInTheDocument();
    });

    it("qualifies the simulation and states the assumptions behind it", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          gender: "male",
          monthlyGrossSalary: 20_000,
          retirementMonthlyExpenses: 1_500,
          pensionBalances: [900_000, 300_000],
          investmentReturnPct: 5,
          inflationPct: 2,
        }),
      );

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Simulated spending coverage to age 90")).parentElement as HTMLElement;
      expect(within(kpi).getByText(/not a guarantee/)).toBeInTheDocument();
      expect(within(kpi).getByText(/Assumes 5% return, 2% inflation and [\d.]+% volatility a year\./)).toBeInTheDocument();
      expect(within(kpi).getByRole("link", { name: "How this is calculated" })).toHaveAttribute("href", "/projections");
    });

    it("says that 100% means every simulated history, not certainty", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          retirementMonthlyExpenses: 1_000,
          otherAssets: 5_000_000,
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Simulated spending coverage to age 90")).parentElement as HTMLElement;
      expect(within(kpi).getByText("100%")).toBeInTheDocument();
      expect(within(kpi).getByText(/^All [\d,]+ simulated market histories fund your spending\. That is not certainty about real outcomes\./)).toBeInTheDocument();
    });

    it("shows a near-zero probability when the spending is out of reach", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          retirementMonthlyExpenses: 1_000_000,
          pensionBalances: [100_000],
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Simulated spending coverage to age 90")).parentElement as HTMLElement;
      expect(within(kpi).getByText("0%")).toBeInTheDocument();
    });

    it("asks about the spouse only when the household has one", async () => {
      await seed(
        buildTestProfile({ age: 40, retirementAge: 67, maritalStatus: "married", ...zeroRealReturn }),
      );

      renderWithProviders(<Dashboard />);

      expect(
        await screen.findByText(/marked as married but your spouse's age is empty/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Your spouse's gender is not set/)).not.toBeInTheDocument();
    });
  });

  describe("a person without a partner", () => {
    const zeroRealReturn = { investmentReturnPct: 4, inflationPct: 4 };

    it.each([null, "single", "divorced", "widowed"] as const)(
      "gets a complete plan from only the two ages (marital status: %s)",
      async (maritalStatus) => {
        await saveProfileToDb(
          buildTestProfile({
            age: 45,
            retirementAge: 62,
            ...(maritalStatus ? { maritalStatus } : {}),
            ...zeroRealReturn,
          }),
        );
        await saveOnboardedToDb(true);

        renderWithProviders(<Dashboard />);

        expect(await screen.findByText("Projected Monthly Income After Tax")).toBeInTheDocument();
        expect(screen.getByText("Years to Retirement")).toBeInTheDocument();
        expect(screen.queryByText(/Your spouse/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Each spouse is taxed/)).not.toBeInTheDocument();
        expect(screen.queryByText(/whole household/)).not.toBeInTheDocument();
      },
    );

    it("ignores a leftover spouse account when the person has no partner", async () => {
      const profile = buildTestProfile({
        age: 45,
        retirementAge: 62,
        maritalStatus: "single",
        pensionBalances: [100_000, 400_000],
        pensionAccountOverrides: [{}, { owner: "spouse" }],
        ...zeroRealReturn,
      });
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);

      renderWithProviders(<Dashboard />);

      const netWorthToday = Math.round(aggregateCurrentNetWorth(profile));
      expect(netWorthToday).toBe(100_000);
      const netWorthKpi = (await screen.findByText("Net Worth Today")).parentElement as HTMLElement;
      expect(within(netWorthKpi).getByText(`\u20aa${netWorthToday.toLocaleString()}`)).toBeInTheDocument();
    });
  });

  describe("Bituach Leumi card", () => {
    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    it("shows the calculated pension, its seniority supplement and the rates' source", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          gender: "male",
          bituachLeumi: { includeInProjection: true },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Bituach Leumi Old-Age Pension")).toBeInTheDocument();
      expect(screen.getByText("\u20aa2,757 per month")).toBeInTheDocument();
      expect(screen.getByText("Starts at age 67")).toBeInTheDocument();
      expect(screen.getByText("Includes a 50% seniority supplement.")).toBeInTheDocument();
      expect(screen.getByText(/Rates as of 01\/01\/2026\./)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Source: Bituach Leumi" })).toHaveAttribute(
        "href",
        expect.stringContaining("btl.gov.il"),
      );
    });

    it("explains the deferral supplement when retiring after the statutory age", async () => {
      await seed(
        buildTestProfile({
          age: 60,
          retirementAge: 69,
          gender: "male",
          bituachLeumi: { includeInProjection: true },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Starts at age 69")).toBeInTheDocument();
      expect(
        screen.getByText("Includes a 10% supplement for deferring past the statutory age (67)."),
      ).toBeInTheDocument();
    });

    it("shows a fractional claim age as years and months", async () => {
      // Born 1969 -> statutory age 64y 9m for women, later than the chosen retirement age.
      await seed(
        buildTestProfile({
          age: new Date().getFullYear() - 1969,
          retirementAge: 60,
          gender: "female",
          bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 2500 },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Starts at age 64 years 9 months")).toBeInTheDocument();
      expect(screen.getByText("\u20aa2,500 per month")).toBeInTheDocument();
      expect(screen.getByText("Based on the amount you entered from Bituach Leumi.")).toBeInTheDocument();
    });

    it("says when the pension is excluded and links to the settings", async () => {
      await seed(buildTestProfile({ age: 40, retirementAge: 67 }));

      renderWithProviders(<Dashboard />);

      expect(
        await screen.findByText(/The state pension is not included in your projections\./),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Edit Bituach Leumi settings" })).toHaveAttribute(
        "href",
        "/my-data/personal",
      );
    });

    it("warns when the insured years don't qualify", async () => {
      await seed(
        buildTestProfile({
          age: 50,
          retirementAge: 51,
          gender: "male",
          bituachLeumi: { includeInProjection: true, insuredYearsToDate: 10 },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText(/may not qualify yet/i)).toBeInTheDocument();
    });

    it("hints at the income supplement when total income is below the guarantee", async () => {
      await seed(
        buildTestProfile({
          age: 66,
          retirementAge: 67,
          gender: "male",
          bituachLeumi: { includeInProjection: true, insuredYearsToDate: 20 },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText(/may be entitled to an income supplement/i)).toBeInTheDocument();
    });
  });

  describe("tax card", () => {
    // 0% real return keeps the incomes exact (see netIncome.test.ts).
    const zeroRealReturn = { investmentReturnPct: 4, inflationPct: 4 };

    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    async function findTaxCard() {
      return within(await screen.findByRole("region", { name: "Income tax in retirement" }));
    }

    it("splits the income into gross, tax and net, and shows the KPI after tax", async () => {
      await seed(
        buildTestProfile({
          age: 62,
          retirementAge: 62,
          ...zeroRealReturn,
          pensionBalances: [6_000_000],
        }),
      );

      renderWithProviders(<Dashboard />);

      const card = await findTaxCard();
      expect(card.getByText("Income before tax").nextElementSibling).toHaveTextContent("\u20aa17,857");
      expect(card.getByText("Estimated tax").nextElementSibling).toHaveTextContent("\u20aa2,917");
      expect(card.getByText("Income after tax").nextElementSibling).toHaveTextContent("\u20aa14,940");
      expect(card.getByText("Effective tax rate: 16.3%")).toBeInTheDocument();
      expect(
        card.getByText(
          "These figures are for the year with the lowest income after tax (age 62); other years are higher.",
        ),
      ).toBeInTheDocument();
      expect(card.getByText(/Tax rates as of 01\/01\/2026\./)).toBeInTheDocument();
      expect(card.getByRole("link", { name: "Source: Israel Tax Authority" })).toHaveAttribute(
        "href",
        expect.stringContaining("gov.il"),
      );

      const incomeKpi = screen.getByText("Projected Monthly Income After Tax").parentElement;
      expect(within(incomeKpi as HTMLElement).getByText("\u20aa14,940")).toBeInTheDocument();
    });

    it("names the basis of the income KPI and reconciles it to the gross income", async () => {
      await seed(
        buildTestProfile({
          age: 62,
          retirementAge: 62,
          ...zeroRealReturn,
          pensionBalances: [6_000_000],
        }),
      );

      renderWithProviders(<Dashboard />);

      const incomeKpi = (await screen.findByText("Projected Monthly Income After Tax"))
        .parentElement as HTMLElement;
      expect(
        within(incomeKpi).getByText(
          "The lowest year of retirement, at your age 62. After tax, in today's money.",
        ),
      ).toBeInTheDocument();
      expect(
        within(incomeKpi).getByText("\u20aa17,857 before tax, minus \u20aa2,917 tax"),
      ).toBeInTheDocument();
    });

    it("says no tax is expected in the income KPI when the exemption and credit points cover the income", async () => {
      const profile = buildTestProfile({
        age: 67,
        retirementAge: 67,
        ...zeroRealReturn,
        pensionBalances: [2_400_000],
      });
      await seed(profile);
      const { grossMonthlyIncome } = estimateNetIncome(profile, "standard");

      renderWithProviders(<Dashboard />);

      const incomeKpi = (await screen.findByText("Projected Monthly Income After Tax"))
        .parentElement as HTMLElement;
      expect(
        within(incomeKpi).getByText(
          `\u20aa${grossMonthlyIncome.toLocaleString()} before tax; no tax expected`,
        ),
      ).toBeInTheDocument();
    });

    it("lists what the estimate includes and leaves out", async () => {
      await seed(
        buildTestProfile({
          age: 62,
          retirementAge: 62,
          ...zeroRealReturn,
          pensionBalances: [6_000_000],
        }),
      );

      renderWithProviders(<Dashboard />);

      const card = await findTaxCard();
      expect(card.getByText(/2026 income tax brackets/)).toBeInTheDocument();
      expect(card.getByText(/57\.5% of a pension of up to \u20aa9,430 per month is exempt in 2026/)).toBeInTheDocument();
      expect(card.getByText(/rises to 67% from 2028/)).toBeInTheDocument();
      expect(
        card.getByText(/health tax: 3\.23% up to \u20aa7,703 per month and 5\.17% above it/),
      ).toBeInTheDocument();
      expect(card.getByText(/taxed at 25% on the real gain only/)).toBeInTheDocument();
      expect(card.getByText(/^Not included: Bituach Leumi contributions/)).toBeInTheDocument();
    });

    it("says no tax is expected when the exemption and credit points cover the income", async () => {
      await seed(
        buildTestProfile({
          age: 67,
          retirementAge: 67,
          ...zeroRealReturn,
          pensionBalances: [2_400_000],
        }),
      );

      renderWithProviders(<Dashboard />);

      const card = await findTaxCard();
      expect(card.getByText("No income tax is expected on this income.")).toBeInTheDocument();
      expect(card.queryByText(/Effective tax rate/)).not.toBeInTheDocument();
    });

    it("is hidden when there is no retirement income", async () => {
      await seed(buildTestProfile({ age: 67, retirementAge: 67 }));

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Net Worth Today")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Income tax in retirement" })).not.toBeInTheDocument();
    });

    it("notes that spouses are taxed separately, and only for a couple", async () => {
      await seed(
        buildTestProfile({
          age: 62,
          gender: "male",
          retirementAge: 62,
          maritalStatus: "married",
          spouse: { age: 62, gender: "male", retirementAge: 62 },
          ...zeroRealReturn,
          pensionBalances: [3_000_000, 3_000_000],
          pensionAccountOverrides: [{ owner: "self" }, { owner: "spouse" }],
        }),
      );

      renderWithProviders(<Dashboard />);

      const card = await findTaxCard();
      expect(card.getByText("Each spouse is taxed on their own income.")).toBeInTheDocument();
      expect(card.getByText("Estimated tax").nextElementSibling).toHaveTextContent("\u20aa1,475");
    });

    it("does not mention spouses for a single person", async () => {
      await seed(
        buildTestProfile({
          age: 62,
          retirementAge: 62,
          ...zeroRealReturn,
          pensionBalances: [6_000_000],
        }),
      );

      renderWithProviders(<Dashboard />);

      const card = await findTaxCard();
      expect(card.queryByText(/Each spouse is taxed/)).not.toBeInTheDocument();
    });
  });

  describe("household", () => {
    // 0% real return keeps the expected ages exact (see household.test.ts).
    const zeroRealReturn = { investmentReturnPct: 4, inflationPct: 4 };
    const married = { maritalStatus: "married" as const };

    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    it("shows the age at which both spouses can retire together", async () => {
      await seed(
        buildTestProfile({
          age: 50,
          otherAssets: 1_500_000,
          retirementMonthlyExpenses: 5000,
          ...zeroRealReturn,
          ...married,
          spouse: { age: 48 },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Age 67")).toBeInTheDocument();
      expect(screen.getByText("Years from today: 17")).toBeInTheDocument();
      expect(
        screen.getByText("Both of you retire together: you at 67, your spouse at 65."),
      ).toBeInTheDocument();
    });

    it("labels the years KPI as household timing and shows both retirement dates", async () => {
      await seed(
        buildTestProfile({
          age: 60,
          retirementAge: 65,
          ...zeroRealReturn,
          ...married,
          spouse: { age: 43, retirementAge: 65 },
        }),
      );

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Years until your household retires"))
        .parentElement as HTMLElement;
      expect(within(kpi).getByText("22")).toBeInTheDocument();
      expect(within(kpi).getByText("Your retirement: age 65, in 5 years")).toBeInTheDocument();
      expect(
        within(kpi).getByText("Your spouse's retirement: age 65, in 22 years"),
      ).toBeInTheDocument();
      expect(within(kpi).getByText("Counted until the later of the two.")).toBeInTheDocument();
    });

    it("shows a single person's own retirement age and years", async () => {
      await seed(buildTestProfile({ age: 60, retirementAge: 67, ...zeroRealReturn }));

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Years to Retirement")).parentElement as HTMLElement;
      expect(within(kpi).getByText("7")).toBeInTheDocument();
      expect(within(kpi).getByText("Your retirement: age 67, in 7 years")).toBeInTheDocument();
      expect(within(kpi).queryByText(/spouse/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Years until your household retires")).not.toBeInTheDocument();
    });

    it("marks the retirement age as assumed, and says so above the figures, while none is entered", async () => {
      await seed(buildTestProfile({ age: 60, ...zeroRealReturn }));

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Years to Retirement")).parentElement as HTMLElement;
      expect(within(kpi).getByText("Your retirement: age 67 (assumed), in 7 years")).toBeInTheDocument();
      const banner = screen.getByRole("note", { name: "Assumed retirement age" });
      expect(within(banner).getByRole("link", { name: "Set your retirement age" })).toHaveAttribute(
        "href",
        "/my-data/personal#retirement-age",
      );
      const gaps = screen.getByRole("region", { name: "Improve your estimate" });
      expect(
        within(gaps).getByText("No retirement age entered, so every figure assumes 67."),
      ).toBeInTheDocument();
    });

    it("shows no assumption notice once the retirement age is entered", async () => {
      await seed(buildTestProfile({ age: 60, retirementAge: 65, ...zeroRealReturn }));

      renderWithProviders(<Dashboard />);

      const kpi = (await screen.findByText("Years to Retirement")).parentElement as HTMLElement;
      expect(within(kpi).getByText("Your retirement: age 65, in 5 years")).toBeInTheDocument();
      expect(screen.queryByRole("note", { name: "Assumed retirement age" })).not.toBeInTheDocument();
      expect(screen.queryByText(/assumed/i)).not.toBeInTheDocument();
    });

    it("keeps the single-person feasibility card unchanged", async () => {
      await seed(
        buildTestProfile({
          age: 50,
          otherAssets: 1_500_000,
          retirementMonthlyExpenses: 5000,
          ...zeroRealReturn,
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Age 65")).toBeInTheDocument();
      expect(screen.queryByText(/Both of you retire together/)).not.toBeInTheDocument();
      expect(screen.queryByText(/projection covers your whole household/i)).not.toBeInTheDocument();
    });

    it("ignores a spouse until their age is entered", async () => {
      await seed(
        buildTestProfile({ age: 50, retirementAge: 67, otherAssets: 1_500_000, ...zeroRealReturn, ...married }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("Net Worth Today")).toBeInTheDocument();
      expect(screen.queryByText(/projection covers your whole household/i)).not.toBeInTheDocument();
    });

    it("explains that the chart covers the household", async () => {
      await seed(
        buildTestProfile({
          age: 50,
          retirementAge: 65,
          otherAssets: 1_500_000,
          ...zeroRealReturn,
          ...married,
          spouse: { age: 48, retirementAge: 63 },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(
        await screen.findByText("The projection covers your whole household. The age axis shows your age."),
      ).toBeInTheDocument();
    });

    it("shows each spouse's Bituach Leumi pension and the supplement for a spouse without one", async () => {
      await seed(
        buildTestProfile({
          age: 60,
          retirementAge: 67,
          gender: "male",
          bituachLeumi: { includeInProjection: true },
          ...married,
          spouse: {
            age: 58,
            retirementAge: 58,
            gender: "female",
            bituachLeumi: { insuredYearsToDate: 0 },
          },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByRole("heading", { name: "You" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Your spouse" })).toBeInTheDocument();
      expect(screen.getByText("Each pension starts at its owner's own age.")).toBeInTheDocument();
      expect(screen.getByText("\u20aa2,757 per month")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Includes a \u20aa924 per month supplement for a spouse without a pension, from age 67.",
        ),
      ).toBeInTheDocument();
    });

    it("lists the Bituach Leumi pension without member headings for a single person", async () => {
      await seed(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          gender: "male",
          bituachLeumi: { includeInProjection: true },
        }),
      );

      renderWithProviders(<Dashboard />);

      expect(await screen.findByText("\u20aa2,757 per month")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "You" })).not.toBeInTheDocument();
      expect(screen.queryByText("Each pension starts at its owner's own age.")).not.toBeInTheDocument();
      expect(screen.queryByText(/supplement for a spouse/)).not.toBeInTheDocument();
    });
  });

  describe("retirement snapshot", () => {
    const shekel = (amount: number) => `\u20aa${Math.round(amount).toLocaleString()}`;
    const plan = {
      age: 40,
      retirementAge: 67,
      gender: "male" as const,
      monthlyGrossSalary: 20_000,
      investmentReturnPct: 5,
      inflationPct: 2,
      pensionBalances: [900_000, 300_000],
      retirementMonthlyExpenses: 9_000,
    };

    async function renderSnapshot(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);
      const heading = await screen.findByRole("heading", { name: "Retirement snapshot" });
      const section = heading.closest("section") as HTMLElement;
      const card = (label: string) =>
        within(section).getByText(label).parentElement as HTMLElement;
      return { section, card };
    }

    it("shows the planned spending, withdrawal rate, pension income and available funds", async () => {
      const profile = buildTestProfile(plan);
      const { withdrawalRate, pension, access } = calculateRetirementKpis(profile);
      const { card } = await renderSnapshot(profile);

      expect(within(card("Planned monthly spending")).getByText(shekel(9_000))).toBeInTheDocument();
      const rate = withdrawalRate!.toLocaleString(undefined, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      expect(within(card("Your withdrawal rate")).getByText(rate)).toBeInTheDocument();
      expect(
        within(card("Your withdrawal rate")).getByText(/planned spending as a share of the funds available/),
      ).toBeInTheDocument();
      expect(
        within(card("Your withdrawal rate")).getByText(/Rates above about 4% rely more on investment returns/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Safe withdrawal rate/)).not.toBeInTheDocument();
      expect(within(card("Monthly pension income")).getByText(shekel(pension.monthly))).toBeInTheDocument();
      expect(
        within(card("Monthly pension income")).getByText("Before tax, from age 67"),
      ).toBeInTheDocument();
      expect(
        within(card("Funds available at retirement")).getByText(shekel(access.accessibleAtRetirement)),
      ).toBeInTheDocument();
    });

    it("says the state pension is not in the projection when it is left out", async () => {
      const { card } = await renderSnapshot(buildTestProfile(plan));

      const stateCard = card("Monthly state benefits");
      expect(within(stateCard).getByText("—")).toBeInTheDocument();
      expect(within(stateCard).getByText("Not in your projection")).toBeInTheDocument();
    });

    it("shows the state pension and the age it starts once it is included", async () => {
      const { card } = await renderSnapshot(
        buildTestProfile({
          ...plan,
          bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 3_000 },
        }),
      );

      const stateCard = card("Monthly state benefits");
      expect(within(stateCard).getByText(shekel(3_000))).toBeInTheDocument();
      expect(within(stateCard).getByText("Tax-free, from age 67")).toBeInTheDocument();
    });

    it("notes how much of the savings is still locked at retirement", async () => {
      const { card } = await renderSnapshot(
        buildTestProfile({
          ...plan,
          retirementAge: 55,
          otherAssets: 400_000,
          pensionAccountOverrides: [
            { productCategory: "comprehensivePension" },
            { productCategory: "comprehensivePension" },
          ],
        }),
      );

      expect(
        within(card("Funds available at retirement")).getByText(/more unlocks at age 60/),
      ).toBeInTheDocument();
    });

    it("asks for spending instead of showing a number when none is entered", async () => {
      const { card } = await renderSnapshot(
        buildTestProfile({ ...plan, retirementMonthlyExpenses: undefined }),
      );

      const spendingCard = card("Planned monthly spending");
      expect(within(spendingCard).getByText("—")).toBeInTheDocument();
      expect(within(spendingCard).getByText("Not entered yet")).toBeInTheDocument();

      const rateCard = card("Your withdrawal rate");
      expect(within(rateCard).getByText("—")).toBeInTheDocument();
      expect(
        within(rateCard).getByText("Needs planned spending and funds available at retirement"),
      ).toBeInTheDocument();
    });
  });

  describe("could-you-retire-at card", () => {
    const plan = {
      age: 40,
      retirementAge: 67,
      gender: "male" as const,
      monthlyGrossSalary: 20_000,
      investmentReturnPct: 5,
      inflationPct: 2,
      pensionBalances: [900_000, 300_000],
      retirementMonthlyExpenses: 9_000,
    };

    async function renderChecks(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);
      await screen.findByText("Net Worth Today");
      return screen.queryByRole("heading", { name: "Could you retire at\u2026?" })?.closest("section") ?? null;
    }

    it("is hidden until retirement spending is entered", async () => {
      const section = await renderChecks(
        buildTestProfile({ ...plan, retirementMonthlyExpenses: undefined }),
      );
      expect(section).toBeNull();
    });

    it("shows now and each of 55, 60 and 65 with the plan's status for it", async () => {
      const profile = buildTestProfile(plan);
      const section = (await renderChecks(profile)) as HTMLElement;

      const items = within(section).getAllByRole("listitem");
      const checks = checkRetirementAges(profile)!;
      expect(items).toHaveLength(4);
      expect(items[0]).toHaveTextContent("Now (age 40)");
      expect(items[1]).toHaveTextContent("At age 55");
      expect(items[2]).toHaveTextContent("At age 60");
      expect(items[3]).toHaveTextContent("At age 65");
      checks.forEach((check, index) => {
        expect(items[index]).toHaveTextContent(check.status === "onTrack" ? "On track" : "Shortfall");
        expect(items[index]).toHaveTextContent(
          `\u20aa${Math.abs(Math.round(check.monthlyGap)).toLocaleString()} per month`,
        );
      });
    });

    it("leaves out the ages the user has already passed", async () => {
      const section = (await renderChecks(buildTestProfile({ ...plan, age: 58 }))) as HTMLElement;

      const items = within(section).getAllByRole("listitem");
      expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual([
        "Now (age 58)",
        "At age 60",
        "At age 65",
      ]);
    });

    it("shows the spouse's age for each check in a couple", async () => {
      const section = (await renderChecks(
        buildTestProfile({
          ...plan,
          maritalStatus: "married",
          spouse: { age: 36, gender: "female" },
        }),
      )) as HTMLElement;

      const items = within(section).getAllByRole("listitem");
      expect(items[0]).toHaveTextContent("Your spouse is 36");
      expect(items[1]).toHaveTextContent("Your spouse is 51");
      expect(items[3]).toHaveTextContent("Your spouse is 61");
    });

    it("does not mention a spouse for a single person", async () => {
      const section = (await renderChecks(buildTestProfile(plan))) as HTMLElement;
      expect(within(section).queryByText(/Your spouse/)).not.toBeInTheDocument();
    });
  });

  describe("cover notice", () => {
    const covered = {
      accountStatus: "activeContributing" as const,
      insuranceCoverages: {
        deathCoverageAmount: 600_000,
        monthlyDisabilityAmount: null,
        monthlyRiskDeduction: 85,
        monthlySurvivorsSpousePension: 3_500,
        survivorSpousePercent: null,
      },
    };
    const base = { age: 50, retirementAge: 55, pensionBalances: [100_000], pensionAccountOverrides: [covered] };
    const heading = { name: "Insurance cover that ends when deposits stop" };

    async function seed(profile: ReturnType<typeof buildTestProfile>) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
    }

    it("tells a person with cover on file and no choice when it ends, with a link to choose", async () => {
      await seed(buildTestProfile(base));
      renderWithProviders(<Dashboard />);

      const card = (await screen.findByRole("heading", heading)).closest("section")!;
      expect(
        within(card).getByText(
          /Your cover ends at about age 55 years 5 months, 4\.6 years before the age it is needed until \(60\)\./,
        ),
      ).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Choose what to do" })).toHaveAttribute("href", "/my-data/personal");
    });

    it("is hidden once a plan is saved", async () => {
      await seed(buildTestProfile({ ...base, coverPlan: createCoverPlan("none") }));
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(screen.queryByRole("heading", heading)).not.toBeInTheDocument();
    });

    it("is hidden when no account states any cover", async () => {
      await seed(buildTestProfile({ age: 50, retirementAge: 55, pensionBalances: [100_000] }));
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(screen.queryByRole("heading", heading)).not.toBeInTheDocument();
    });

    it("is hidden when the person retires at or after the age the cover is needed until", async () => {
      await seed(buildTestProfile({ ...base, retirementAge: 62 }));
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(screen.queryByRole("heading", heading)).not.toBeInTheDocument();
    });

    it("lists the spouse separately", async () => {
      await seed(
        buildTestProfile({
          ...base,
          maritalStatus: "married",
          spouse: { age: 48, retirementAge: 52 },
          pensionBalances: [100_000, 80_000],
          pensionAccountOverrides: [covered, { ...covered, owner: "spouse" as const }],
        }),
      );
      renderWithProviders(<Dashboard />);

      const card = (await screen.findByRole("heading", heading)).closest("section")!;
      expect(within(card).getAllByRole("listitem")).toHaveLength(2);
      expect(within(card).getByText(/Your spouse's cover ends at about age 52 years 5 months, 7\.6 years/)).toBeInTheDocument();
    });

    it("leaves out a spouse who has already chosen", async () => {
      await seed(
        buildTestProfile({
          ...base,
          maritalStatus: "married",
          spouse: { age: 48, retirementAge: 52, coverPlan: createCoverPlan("termLife") },
          pensionBalances: [100_000, 80_000],
          pensionAccountOverrides: [covered, { ...covered, owner: "spouse" as const }],
        }),
      );
      renderWithProviders(<Dashboard />);

      const card = (await screen.findByRole("heading", heading)).closest("section")!;
      expect(within(card).getAllByRole("listitem")).toHaveLength(1);
      expect(within(card).queryByText(/Your spouse's cover/)).not.toBeInTheDocument();
    });
  });

  describe("assumptions in use", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const summary = () => screen.getByRole("note", { name: "Assumptions in use" });

    it("names the preset and the yearly values the figures rest on, with a way to change them", async () => {
      await saveProfileToDb(buildTestProfile({ age: 40, retirementAge: 67, otherAssets: 300_000 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const text = summary().textContent!.replace(BIDI_MARKS, "");
      expect(text).toContain("Base");
      expect(text).toContain("Investment return 6% (before inflation), inflation 2.5%, market volatility 12%. All per year.");
      expect(within(summary()).getByRole("link", { name: "Change assumptions" })).toHaveAttribute(
        "href",
        "/my-data/assumptions",
      );
    });

    it("says Custom, not a preset, once a value has been changed", async () => {
      await saveProfileToDb(
        buildTestProfile({ age: 40, retirementAge: 67, otherAssets: 300_000, investmentReturnPct: 9 }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const text = summary().textContent!.replace(BIDI_MARKS, "");
      expect(text).toContain("Custom");
      expect(text).not.toContain("Base");
      expect(text).toContain("Investment return 9%");
    });

    it("is not shown before there is a plan", async () => {
      renderWithProviders(<Dashboard />);

      await screen.findByText("Complete your profile to see your personalized retirement projection.");
      expect(screen.queryByRole("note", { name: "Assumptions in use" })).not.toBeInTheDocument();
    });
  });

  describe("portfolio summary", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const summary = () => screen.getByRole("region", { name: "What Net Worth Today is made of" });
    const rowAmount = (name: string) =>
      within(within(summary()).getByRole("row", { name: new RegExp(name) }))
        .getByText(/^\u20aa/)
        .textContent!.replace(BIDI_MARKS, "");

    const rich = buildTestProfile({
      age: 50,
      retirementAge: 67,
      pensionBalances: [500_000, 100_000],
      pensionAccountOverrides: [{ productCategory: "comprehensivePension" }, { productCategory: "studyFund" }],
      otherAssets: 20_000,
      bankDeposits: [{ amount: 200_000 }],
      usdToIlsRate: { rate: 3, date: "2026-06-01" },
      equity: [
        {
          quantity: 200,
          priceUSD: 10,
          employerGrant: {
            vestingTranches: [
              { vestDate: "2025-01-01", quantity: 120 },
              { vestDate: "2027-01-01", quantity: 80 },
            ],
          },
        },
      ],
    });

    it("lists what the Net Worth Today figure is made of, adding up to it", async () => {
      await saveProfileToDb(rich);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(rowAmount("Pension funds")).toBe("\u20aa500,000");
      expect(rowAmount("Study funds")).toBe("\u20aa100,000");
      expect(rowAmount("Bank deposits")).toBe("\u20aa200,000");
      expect(rowAmount("Employer shares")).toBe("\u20aa3,600");
      expect(rowAmount("Cash and other assets")).toBe("\u20aa20,000");
      const total = Math.round(aggregateCurrentNetWorth(rich)).toLocaleString();
      expect(total).toBe("823,600");
      expect(rowAmount("Total")).toBe(`\u20aa${total}`);
      const kpi = screen.getByText("Net Worth Today").parentElement as HTMLElement;
      expect(within(kpi).getByText(`\u20aa${total}`)).toBeInTheDocument();
    });

    it("leaves out the kinds of assets that have nothing in them", async () => {
      await saveProfileToDb(rich);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(within(summary()).queryByText("Provident funds")).not.toBeInTheDocument();
      expect(within(summary()).queryByText("Private shares and ESPP")).not.toBeInTheDocument();
    });

    it("links each row to its own section of the step where it is entered, and the figure to the summary", async () => {
      await saveProfileToDb(rich);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const link = (name: string) => within(summary()).getByRole("link", { name });
      expect(link("Pension funds")).toHaveAttribute("href", "/my-data/pension-savings#pension-summary");
      expect(link("Study funds")).toHaveAttribute("href", "/my-data/pension-savings#pension-summary");
      expect(link("Bank deposits")).toHaveAttribute("href", "/my-data/equity#bank-deposits-summary");
      expect(link("Employer shares (vested)")).toHaveAttribute(
        "href",
        "/my-data/equity#equity-summary-employerGrantedStock",
      );
      expect(link("Cash and other assets")).toHaveAttribute(
        "href",
        "/my-data/pension-savings#other-assets",
      );
      expect(screen.getByRole("link", { name: "See what it is made of" })).toHaveAttribute(
        "href",
        "#portfolio-summary",
      );
      expect(summary()).toHaveAttribute("id", "portfolio-summary");
    });

    it("says what is left out because it has not vested, and the exchange rate used", async () => {
      await saveProfileToDb(rich);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const text = summary().textContent!.replace(BIDI_MARKS, "");
      expect(text).toContain(
        "Not counted above: \u20aa2,400 of employer shares that have not vested yet.",
      );
      expect(text).toContain("Share prices are converted at 3 \u20aa per US dollar (Bank of Israel rate on 01/06/2026).");
      expect(within(summary()).getByRole("link", { name: "Change the rate" })).toHaveAttribute(
        "href",
        "/my-data/equity",
      );
    });

    it("says how much of the total is employer shares, and where to test a fall", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 50,
          retirementAge: 67,
          otherAssets: 100_000,
          usdToIlsRate: { rate: 3 },
          equity: [{ quantity: 1_000, priceUSD: 100, employerGrant: {} }],
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(rowAmount("Employer shares")).toBe("\u20aa300,000");
      expect(summary().textContent!.replace(BIDI_MARKS, "")).toContain(
        "Employer shares are 75% of this total, all in one company.",
      );
      expect(within(summary()).getByRole("link", { name: "See what a fall in their price would do" })).toHaveAttribute(
        "href",
        "/projections",
      );
    });

    it("says a small employer holding is under one percent", async () => {
      await saveProfileToDb(rich);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(summary().textContent!.replace(BIDI_MARKS, "")).toContain(
        "Employer shares are <1% of this total, all in one company.",
      );
    });

    it("has no share notes when there are no shares", async () => {
      await saveProfileToDb(
        buildTestProfile({ age: 50, retirementAge: 67, pensionBalances: [400_000], otherAssets: 10_000 }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const text = summary().textContent!;
      expect(text).not.toContain("Not counted above");
      expect(text).not.toContain("Share prices are converted");
      expect(text).not.toContain("Employer shares are");
      expect(within(summary()).queryByRole("link", { name: "Change the rate" })).not.toBeInTheDocument();
    });

    it("says when the plan covers a spouse's accounts too", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 50,
          retirementAge: 67,
          maritalStatus: "married",
          spouse: { age: 48 },
          pensionBalances: [300_000, 150_000],
          pensionAccountOverrides: [{}, { owner: "spouse" }],
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(within(summary()).getByText("Includes your spouse's accounts.")).toBeInTheDocument();
      expect(rowAmount("Pension funds")).toBe("\u20aa450,000");
    });

    it("is not shown when nothing has been entered", async () => {
      await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 67 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(screen.queryByRole("region", { name: "What Net Worth Today is made of" })).not.toBeInTheDocument();
    });
  });

  describe("retirement budget", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const budget = () => screen.getByRole("region", { name: "Retirement budget" });
    const rowText = (name: string) =>
      within(budget()).getByRole("row", { name: new RegExp(name) }).textContent!.replace(BIDI_MARKS, "");

    const itemised = buildTestProfile({
      age: 66,
      retirementAge: 67,
      pensionBalances: [900_000],
      expenseItems: [
        { amount: 5_000, category: "housing", necessity: "essential" },
        { amount: 1_500, category: "food", necessity: "essential" },
        { amount: 2_400, category: "travel", frequency: "yearly", necessity: "discretionary" },
        { amount: 1_000, category: "lifestyle", necessity: "discretionary" },
      ],
    });

    it("shows the essential and the full budget, each with its gap against the net income", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      const income = calculateFundingGap(itemised, "standard").estimatedMonthlyIncome;
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const gap = (budgetAmount: number) => {
        const diff = Math.round(income - budgetAmount);
        return diff >= 0
          ? `\u20aa${diff.toLocaleString()} per month to spare`
          : `\u20aa${(-diff).toLocaleString()} per month short`;
      };
      expect(rowText("Essential budget")).toBe(`Essential budget\u20aa6,500${gap(6_500)}`);
      expect(rowText("Full planned budget")).toBe(`Full planned budget\u20aa7,700${gap(7_700)}`);
    });

    it("uses the planned spending shown elsewhere as the full budget", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const planned = within(screen.getByRole("region", { name: "Retirement snapshot" }));
      expect(planned.getByText("\u20aa7,700")).toBeInTheDocument();
    });

    it("breaks the budget down by category, largest first, with the totals adding up", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const rows = within(budget())
        .getAllByRole("row")
        .map((row) => row.textContent!.replace(BIDI_MARKS, ""));
      const categoryRows = rows.filter((text) => /^(Housing|Food|Travel|Personal)/.test(text));
      expect(categoryRows).toEqual([
        "Housing\u20aa5,000\u2014",
        "Food and household\u20aa1,500\u2014",
        "Personal and lifestyle\u2014\u20aa1,000",
        "Travel and leisure\u2014\u20aa200",
      ]);
    });

    it("links to the expenses step", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(within(budget()).getByRole("link", { name: "Edit expenses" })).toHaveAttribute(
        "href",
        "/my-data/expenses",
      );
    });

    it("explains that the budgets are compared with the same income", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(budget().textContent).toContain("Both budgets are compared with the same estimated net income.");
    });

    it("asks to itemise when the plan has one typed total, and shows no split", async () => {
      await saveProfileToDb(
        buildTestProfile({ age: 66, retirementAge: 67, pensionBalances: [900_000], retirementMonthlyExpenses: 8_000 }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(budget().textContent).toContain("cannot tell essential spending from discretionary spending");
      expect(within(budget()).queryByRole("table")).not.toBeInTheDocument();
      expect(within(budget()).getByRole("link", { name: "Itemise my expenses" })).toHaveAttribute(
        "href",
        "/my-data/expenses",
      );
    });

    it("is not shown when no spending has been entered", async () => {
      await saveProfileToDb(buildTestProfile({ age: 66, retirementAge: 67, pensionBalances: [900_000] }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(screen.queryByRole("region", { name: "Retirement budget" })).not.toBeInTheDocument();
    });
  });

  describe("irregular costs", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const card = () => screen.getByRole("region", { name: "Irregular costs included in your monthly average" });
    const rowText = (name: string) =>
      within(card()).getByRole("row", { name: new RegExp(name) }).textContent!.replace(BIDI_MARKS, "");

    const profile = buildTestProfile({
      age: 66,
      retirementAge: 67,
      pensionBalances: [900_000],
      expenseItems: [
        { name: "Rent", amount: 6_000, category: "housing", necessity: "essential" },
        { name: "Arnona", amount: 1_800, frequency: "bimonthly", category: "housing", necessity: "essential" },
        { name: "Holidays", amount: 24_000, frequency: "yearly", category: "travel", necessity: "discretionary" },
        {
          name: "Car replacement",
          amount: 60_000,
          frequency: "everyYears",
          everyYears: 5,
          category: "transport",
          necessity: "discretionary",
        },
      ],
    });

    it("lists the payments made once a year or less often, with how often and what each adds", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(rowText("Holidays")).toBe("Holidays\u20aa24,000Once a year\u20aa2,000");
      expect(rowText("Car replacement")).toBe("Car replacement\u20aa60,000Every 5 years\u20aa1,000");
      expect(within(card()).queryByRole("row", { name: /Rent|Arnona/ })).not.toBeInTheDocument();
      expect(rowText("Total in your monthly average")).toBe("Total in your monthly average\u20aa3,000");
    });

    it("says it is an average, not a schedule, and what share of the spending it is", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const text = card().textContent!.replace(BIDI_MARKS, "");
      expect(text).toContain("This is an average, not a payment schedule");
      expect(text).toContain("the plan does not know when any of them falls due");
      // 3,000 of the 9,900 a month
      expect(text).toContain("30% of your planned monthly spending.");
    });

    it("states the cash the largest payment needs when it falls due", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(card().textContent!.replace(BIDI_MARKS, "")).toContain(
        "The largest single payment is \u20aa60,000 (Car replacement).",
      );
    });

    it("is pointed to from the planned spending figure, which says how much of it is averaged", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      const planned = screen.getByText("Planned monthly spending").parentElement as HTMLElement;
      expect(planned.textContent!.replace(BIDI_MARKS, "")).toContain(
        "Includes \u20aa3,000 per month of irregular costs, averaged.",
      );
      expect(within(planned).getByRole("link", { name: "See which" })).toHaveAttribute("href", "#irregular-costs");
      expect(card()).toHaveAttribute("id", "irregular-costs");
    });

    it("is not shown when every cost is regular, and says nothing under the planned spending", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 66,
          retirementAge: 67,
          pensionBalances: [900_000],
          expenseItems: [{ amount: 6_000 }, { amount: 900, frequency: "quarterly" }],
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(
        screen.queryByRole("region", { name: "Irregular costs included in your monthly average" }),
      ).not.toBeInTheDocument();
      const planned = screen.getByText("Planned monthly spending").parentElement as HTMLElement;
      expect(planned.textContent).not.toContain("irregular");
    });

    it("is not shown for one typed total", async () => {
      await saveProfileToDb(
        buildTestProfile({ age: 66, retirementAge: 67, pensionBalances: [900_000], retirementMonthlyExpenses: 8_000 }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      await screen.findByText("Net Worth Today");
      expect(
        screen.queryByRole("region", { name: "Irregular costs included in your monthly average" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("net worth path events", () => {
    const annuityParameters = {
      hasGuaranteedFactor: false,
      conversionFactor: 200,
      estimatedMonthlyAnnuity: null,
      annuityTaxType: null,
      guaranteedPaymentMonths: null,
    };
    const plain = (element: HTMLElement) => element.textContent!.replace(/[\u2066\u2069]/g, "");

    it("explains when drawing starts and when a pension becomes an annuity under the chart", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          pensionBalances: [400_000],
          pensionAccountOverrides: [{ productCategory: "pensionFund", annuityParameters }],
          retirementMonthlyExpenses: 3_000,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      const events = await screen.findByRole("region", { name: "What shapes this path" });
      expect(within(events).getAllByRole("listitem")).toHaveLength(1);
      expect(plain(events)).toContain("Age 60: you retire and start drawing on your savings.");
      expect(plain(events)).toMatch(/Age 60: Pension Fund\. The ₪[\d,]+ of capital becomes an annuity of ₪[\d,]+ a month\./);
    });

    it("words the retirement for a household", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 50,
          retirementAge: 60,
          maritalStatus: "married",
          spouse: { age: 48, retirementAge: 62 },
          pensionBalances: [400_000],
          retirementMonthlyExpenses: 3_000,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Dashboard />);

      const events = await screen.findByRole("region", { name: "What shapes this path" });
      expect(plain(events)).toContain("the later of you two has retired, and the household starts drawing on its savings.");
    });
  });
});
