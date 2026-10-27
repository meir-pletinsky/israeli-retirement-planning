import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  aggregateCurrentNetWorth,
  calculateFundingGap,
  estimateNetIncome,
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
    const { netMonthlyIncome } = estimateNetIncome(profile, "standard");
    const fundingGap = calculateFundingGap(profile, "standard");
    const years = yearsToRetirement(profile, "standard");

    renderWithProviders(<Dashboard />);

    expect(
      await screen.findByText(`\u20aa${netWorthToday.toLocaleString()}`),
    ).toBeInTheDocument();
    const incomeKpi = screen.getByText("Projected Monthly Income After Tax").parentElement;
    expect(
      within(incomeKpi as HTMLElement).getByText(`\u20aa${netMonthlyIncome.toLocaleString()}`),
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

      const gapKpi = (await screen.findByText("Funding Gap")).parentElement as HTMLElement;
      expect(within(gapKpi).getByText("—")).toBeInTheDocument();
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
      const gapKpi = screen.getByText("Funding Gap").parentElement as HTMLElement;
      expect(within(gapKpi).queryByText("—")).not.toBeInTheDocument();
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
      expect(await screen.findByText(`\u20aa${netWorthToday.toLocaleString()}`)).toBeInTheDocument();
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
      expect(screen.getByText(/Rates as of 01\.01\.2026\./)).toBeInTheDocument();
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
      expect(card.getByText("Estimated tax").nextElementSibling).toHaveTextContent("\u20aa2,143");
      expect(card.getByText("Income after tax").nextElementSibling).toHaveTextContent("\u20aa15,714");
      expect(card.getByText("Effective tax rate: 12.0%")).toBeInTheDocument();
      expect(
        card.getByText(
          "These figures are for the year with the lowest income after tax (age 62); other years are higher.",
        ),
      ).toBeInTheDocument();
      expect(card.getByText(/Tax rates as of 01\.01\.2026\./)).toBeInTheDocument();
      expect(card.getByRole("link", { name: "Source: Israel Tax Authority" })).toHaveAttribute(
        "href",
        expect.stringContaining("gov.il"),
      );

      const incomeKpi = screen.getByText("Projected Monthly Income After Tax").parentElement;
      expect(within(incomeKpi as HTMLElement).getByText("\u20aa15,714")).toBeInTheDocument();
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
      expect(card.getByText(/57\.5% of a pension of up to \u20aa9,430 per month is exempt/)).toBeInTheDocument();
      expect(card.getByText(/taxed at 25% on the real gain only/)).toBeInTheDocument();
      expect(card.getByText(/^Not included: health tax/)).toBeInTheDocument();
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
      expect(card.getByText("Estimated tax").nextElementSibling).toHaveTextContent("\u20aa850");
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
});
