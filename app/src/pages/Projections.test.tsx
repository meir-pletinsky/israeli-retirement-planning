import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllData, loadProfileFromDb, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { Projections } from "./Projections";

beforeEach(async () => {
  await clearAllData();
});

describe("Projections", () => {
  it("shows which sources pay in each stage of retirement", async () => {
    // Retiring at 55 with a pension that opens at 60: investments alone fund the first five years.
    await saveProfileToDb(
      buildTestProfile({
        age: 55,
        retirementAge: 55,
        otherAssets: 60_000,
        pensionBalances: [600_000],
        pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
        investmentReturnPct: 4,
        inflationPct: 4,
      }),
    );
    await saveOnboardedToDb(true);

    renderWithProviders(<Projections />);

    const timeline = await screen.findByRole("region", { name: "Retirement timeline" });
    const rows = within(timeline).getAllByRole("row").slice(1);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(within(rows[0]).getByText("55\u201359")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Investments (deposits, shares, cash)")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("Pension Fund")).not.toBeInTheDocument();
    expect(within(rows[1]).getByText("Pension Fund")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("Spouse:")).not.toBeInTheDocument();
    expect(screen.queryByText(/plan covers your whole household/i)).not.toBeInTheDocument();
  });

  it("charts the income after tax for each retirement year", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 62,
        retirementAge: 62,
        pensionBalances: [6_000_000],
        investmentReturnPct: 4,
        inflationPct: 4,
      }),
    );
    await saveOnboardedToDb(true);

    renderWithProviders(<Projections />);

    expect(await screen.findByRole("heading", { name: "Sustainable income after tax" })).toBeInTheDocument();
    expect(
      screen.getByText(/split into what you keep and the income tax paid/i),
    ).toBeInTheDocument();
  });

  it("leaves out the after-tax chart when there is no retirement income", async () => {
    await saveProfileToDb(buildTestProfile({ age: 62, retirementAge: 62 }));
    await saveOnboardedToDb(true);

    renderWithProviders(<Projections />);

    expect(await screen.findByText("Sustainable income by source")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sustainable income after tax" })).not.toBeInTheDocument();
  });

  describe("which spending each chart follows", () => {
    // 0% real return: 120,000 pays 12,000 a year for ten years, so 1,000 a month runs out at 77.
    const retiring = {
      age: 66,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
    };
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));

    const renderProjections = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      await screen.findByRole("heading", { name: "Net Worth Projection" });
    };

    it("says the net-worth line draws the planned spending and where it goes unfunded", async () => {
      await renderProjections(buildTestProfile({ ...retiring, retirementMonthlyExpenses: 1_000 }));

      expect(
        screen.getByText(reads(/Your savings if you spend ₪1,000 a month from retirement, your planned spending/)),
      ).toBeInTheDocument();
      expect(screen.getByText(reads(/From age 77 your usable savings no longer cover it/))).toBeInTheDocument();
    });

    it("says when the savings cover the planned spending to the end of the plan", async () => {
      await renderProjections(buildTestProfile({ ...retiring, retirementMonthlyExpenses: 100 }));

      expect(screen.getByText(/Your usable savings cover it through age 90/)).toBeInTheDocument();
      expect(screen.queryByText(/no longer cover it/)).not.toBeInTheDocument();
    });

    it("says nothing is drawn when no spending is entered", async () => {
      await renderProjections(buildTestProfile(retiring));

      expect(screen.getByText(/No retirement spending is entered, so nothing is drawn/)).toBeInTheDocument();
    });

    it("says the income charts show what the savings can sustain, not the planned spending", async () => {
      await renderProjections(buildTestProfile({ ...retiring, retirementMonthlyExpenses: 1_000 }));

      const incomeNotes = screen.getAllByText(/This is not your planned spending and does not change when you change it/);
      // Under the income chart and under the retirement timeline.
      expect(incomeNotes).toHaveLength(2);
      expect(screen.getByRole("heading", { name: "Sustainable income by source" })).toBeInTheDocument();
    });

    it("warns that income from savings stops when the planned spending would exhaust them", async () => {
      await renderProjections(buildTestProfile({ ...retiring, retirementMonthlyExpenses: 1_000 }));

      const warnings = screen.getAllByText(
        reads(/At your planned ₪1,000 a month your usable savings run out at age 77/),
      );
      expect(warnings).toHaveLength(2);
    });

    it("does not warn about the income when the planned spending is funded", async () => {
      await renderProjections(buildTestProfile({ ...retiring, retirementMonthlyExpenses: 100 }));

      expect(screen.queryByText(/your usable savings run out at age/)).not.toBeInTheDocument();
    });

    it("explains the planned-spending line on the after-tax chart only when spending is entered", async () => {
      await renderProjections(
        buildTestProfile({ ...retiring, pensionBalances: [6_000_000], age: 62, retirementAge: 62, retirementMonthlyExpenses: 20_000 }),
      );
      expect(screen.getByText(/The dashed line is your planned spending after tax/)).toBeInTheDocument();
    });

    it("has no planned-spending line to explain without an entered spending", async () => {
      await renderProjections(buildTestProfile({ ...retiring, pensionBalances: [6_000_000], age: 62, retirementAge: 62 }));
      expect(screen.queryByText(/dashed line/)).not.toBeInTheDocument();
    });
  });

  describe("recurring payments and withdrawals", () => {
    const renderProjections = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return within(await screen.findByRole("region", { name: "Retirement timeline" }));
    };

    it("shows income taken from savings as withdrawals, not as recurring payments", async () => {
      const timeline = await renderProjections(
        buildTestProfile({
          age: 55,
          retirementAge: 55,
          otherAssets: 60_000,
          pensionBalances: [600_000],
          pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
          investmentReturnPct: 4,
          inflationPct: 4,
        }),
      );

      const rows = timeline.getAllByRole("row").slice(1);
      for (const row of rows) {
        expect(within(row).getByText("Withdrawals from savings")).toBeInTheDocument();
        expect(within(row).queryByText("Recurring payments")).not.toBeInTheDocument();
      }
      // The chart legend lists them under the same heading.
      expect(screen.getAllByText("Withdrawals from savings").length).toBeGreaterThan(rows.length);
      expect(screen.queryByText("Recurring payments")).not.toBeInTheDocument();
    });

    it("lists the state pension as a recurring payment next to the withdrawals", async () => {
      const timeline = await renderProjections(
        buildTestProfile({
          age: 60,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 4,
          pensionBalances: [600_000],
          bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 2000 },
        }),
      );

      const last = timeline.getAllByRole("row").at(-1)!;
      const payments = within(last).getByText("Recurring payments").parentElement!;
      expect(within(payments).getByText("Bituach Leumi")).toBeInTheDocument();
      expect(within(payments).queryByText("Pension Fund")).not.toBeInTheDocument();
      const withdrawals = within(last).getByText("Withdrawals from savings").parentElement!;
      expect(within(withdrawals).getByText("Pension Fund")).toBeInTheDocument();
      expect(within(withdrawals).queryByText("Bituach Leumi")).not.toBeInTheDocument();
    });

    it("explains that withdrawals can include the original capital", async () => {
      await renderProjections(buildTestProfile({ age: 60, retirementAge: 60, pensionBalances: [600_000] }));

      // Under the income chart and, shorter, under the timeline.
      expect(screen.getAllByText(/original capital, not only returns/)).toHaveLength(2);
      expect(screen.getByText(/does not separate interest or dividends from capital/)).toBeInTheDocument();
    });

    it("leaves out sources that have no accounts", async () => {
      await renderProjections(buildTestProfile({ age: 60, retirementAge: 60, pensionBalances: [600_000] }));

      expect(screen.getAllByText("Pension Fund").length).toBeGreaterThan(0);
      for (const unused of ["Managers Insurance", "Provident Fund", "Study Fund"]) {
        expect(screen.queryByText(unused)).not.toBeInTheDocument();
      }
    });

    it("says the other-investments band is one pool only when it is shown", async () => {
      await renderProjections(buildTestProfile({ age: 60, retirementAge: 60, pensionBalances: [600_000] }));
      expect(screen.queryByText(/is one pool/)).not.toBeInTheDocument();
    });

    it("says what the other-investments band pools", async () => {
      await renderProjections(
        buildTestProfile({ age: 60, retirementAge: 60, otherAssets: 300_000, bankDeposits: [{ amount: 100_000 }] }),
      );
      expect(
        screen.getByText(
          /Investments \(deposits, shares, cash\) form one pool: bank deposits, private shares, vested employer shares/,
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows the spouse's age beside each stage of a couple's retirement", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 55,
        retirementAge: 55,
        otherAssets: 60_000,
        pensionBalances: [600_000],
        pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
        investmentReturnPct: 4,
        inflationPct: 4,
        maritalStatus: "married",
        spouse: { age: 50, retirementAge: 50 },
      }),
    );
    await saveOnboardedToDb(true);

    renderWithProviders(<Projections />);

    const timeline = await screen.findByRole("region", { name: "Retirement timeline" });
    const rows = within(timeline).getAllByRole("row").slice(1);

    // The spouse is five years younger throughout.
    expect(within(rows[0]).getByText("55\u201359")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Spouse:")).toBeInTheDocument();
    expect(within(rows[0]).getByText("50\u201354")).toBeInTheDocument();
    expect(
      screen.getByText(/plan covers your whole household and ages are yours/i),
    ).toBeInTheDocument();
  });

  describe("a person without a partner", () => {
    it.each([null, "single", "divorced", "widowed", "married"] as const)(
      "projects and compares from only the two ages, with no spouse content (marital status: %s)",
      async (maritalStatus) => {
        await saveProfileToDb(
          buildTestProfile({
            age: 45,
            retirementAge: 62,
            ...(maritalStatus ? { maritalStatus } : {}),
          }),
        );
        await saveOnboardedToDb(true);

        renderWithProviders(<Projections />);

        const comparison = within(await screen.findByRole("region", { name: "Compare retirement ages" }));
        expect(comparison.getAllByRole("columnheader")).toHaveLength(3);
        expect(comparison.queryByRole("rowheader", { name: "Your spouse retires at" })).not.toBeInTheDocument();
        expect(screen.queryByText(/whole household/i)).not.toBeInTheDocument();
        const timeline = screen.getByRole("region", { name: "Retirement timeline" });
        expect(within(timeline).queryByText("Spouse:")).not.toBeInTheDocument();
      },
    );
  });

  describe("retirement age comparison", () => {
    const planned = {
      age: 55,
      retirementAge: 65,
      monthlyGrossSalary: 20_000,
      pensionBalances: [1_500_000],
      retirementMonthlyExpenses: 9_000,
      investmentReturnPct: 4,
      inflationPct: 4,
    };

    async function renderComparison(profile = buildTestProfile(planned)) {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return within(await screen.findByRole("region", { name: "Compare retirement ages" }));
    }

    it("compares the early, standard and delayed ages and marks the user's plan", async () => {
      const comparison = await renderComparison();

      const headers = comparison.getAllByRole("columnheader").map((header) => header.textContent);
      expect(headers).toEqual(["Age 60", "Age 65Your plan", "Age 68"]);
      expect(comparison.getByRole("rowheader", { name: "Savings when you start drawing" })).toBeInTheDocument();
      expect(comparison.getByRole("rowheader", { name: "Income after tax" })).toBeInTheDocument();
      expect(comparison.getByRole("rowheader", { name: "Gap vs. desired spending" })).toBeInTheDocument();
      expect(comparison.queryByRole("rowheader", { name: "Your spouse retires at" })).not.toBeInTheDocument();
      expect(comparison.queryByText(/spouse's retirement moves/i)).not.toBeInTheDocument();
    });

    it("recomputes a column when its age changes", async () => {
      const user = userEvent.setup();
      const comparison = await renderComparison();

      const third = comparison.getByLabelText(/^Retirement age, option 3/);
      await user.clear(third);
      await user.type(third, "72");

      expect(comparison.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Age 60",
        "Age 65Your plan",
        "Age 72",
      ]);
      const years = comparison.getByRole("row", { name: /Years from today/ });
      expect(within(years).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["5", "10", "17"]);
    });

    it("explains an age that cannot be compared and leaves its column empty", async () => {
      const user = userEvent.setup();
      const comparison = await renderComparison();

      const first = comparison.getByLabelText(/^Retirement age, option 1/);
      await user.clear(first);
      await user.type(first, "40");

      expect(comparison.getByText("Enter an age from 55 to 80.")).toBeInTheDocument();
      const net = comparison.getByRole("row", { name: /Income after tax/ });
      expect(within(net).getAllByRole("cell")[0]).toHaveTextContent("-");
      expect(within(net).getAllByRole("cell")[1]).toHaveTextContent("\u20aa");
    });

    it("shows the spouse's retirement age for a couple", async () => {
      const comparison = await renderComparison(
        buildTestProfile({
          ...planned,
          maritalStatus: "married",
          spouse: { age: 52, retirementAge: 63 },
        }),
      );

      const spouse = comparison.getByRole("row", { name: /Your spouse retires at/ });
      expect(within(spouse).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["58", "63", "66"]);
      expect(comparison.getByText(/spouse's retirement moves by the same number of years/i)).toBeInTheDocument();
    });

    it("asks for desired expenses instead of showing a gap when there is no target", async () => {
      const comparison = await renderComparison(
        buildTestProfile({ ...planned, retirementMonthlyExpenses: undefined }),
      );

      expect(comparison.getByText(/Enter your expected monthly retirement expenses/)).toBeInTheDocument();
      expect(comparison.queryByRole("rowheader", { name: "Gap vs. desired spending" })).not.toBeInTheDocument();
      expect(comparison.getByRole("rowheader", { name: "Income after tax" })).toBeInTheDocument();
    });

    describe("remembering the chosen ages", () => {
      it("saves the three ages once they are all valid", async () => {
        const user = userEvent.setup();
        const comparison = await renderComparison();
        expect((await loadProfileFromDb())?.comparisonAges).toBeNull();

        const third = comparison.getByLabelText(/^Retirement age, option 3/);
        await user.clear(third);
        await user.type(third, "72");

        await waitFor(async () => expect((await loadProfileFromDb())?.comparisonAges).toEqual([60, 65, 72]));
      });

      it("does not save while an age is invalid", async () => {
        const user = userEvent.setup();
        const comparison = await renderComparison();

        const first = comparison.getByLabelText(/^Retirement age, option 1/);
        await user.clear(first);
        await user.type(first, "40");
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect((await loadProfileFromDb())?.comparisonAges).toBeNull();
      });

      it("reopens with the ages that were saved", async () => {
        const comparison = await renderComparison(
          buildTestProfile({ ...planned, comparisonAges: [58, 63, 70] }),
        );

        expect(comparison.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
          "Age 58",
          "Age 63",
          "Age 70",
        ]);
      });
    });
  });

  describe("earliest feasible retirement", () => {
    it("shows the feasibility card above the comparison", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 55,
          retirementAge: 65,
          monthlyGrossSalary: 20_000,
          pensionBalances: [1_500_000],
          retirementMonthlyExpenses: 9_000,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      expect(await screen.findByRole("heading", { name: "Earliest Feasible Retirement" })).toBeInTheDocument();
    });

    it("says the age is for average markets and adds the confident age", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 55,
          retirementAge: 65,
          monthlyGrossSalary: 20_000,
          pensionBalances: [1_500_000],
          retirementMonthlyExpenses: 9_000,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Earliest Feasible Retirement" });
      expect(
        within(card).getByText("In average markets, where your assumed return is earned every year."),
      ).toBeInTheDocument();
      expect(within(card).getByText(/90% confidence/)).toBeInTheDocument();
    });

    it("links to Expenses when there is no target", async () => {
      await saveProfileToDb(buildTestProfile({ age: 55, retirementAge: 65 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Earliest Feasible Retirement" });
      expect(within(card).getByRole("link", { name: "Add expenses" })).toHaveAttribute(
        "href",
        "/my-data/expenses",
      );
    });
  });

  describe("risk analysis", () => {
    const plan = (retirementMonthlyExpenses: number) =>
      buildTestProfile({
        age: 40,
        retirementAge: 67,
        gender: "male",
        monthlyGrossSalary: 20_000,
        investmentReturnPct: 5,
        inflationPct: 2,
        pensionBalances: [900_000, 300_000],
        retirementMonthlyExpenses,
      });
    const planned = plan(4_000);

    it("shows the chance the desired spending lasts and the spending that holds up", async () => {
      await saveProfileToDb(planned);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Risk analysis" });
      expect(within(card).getByText("Chance your desired spending lasts to age 90")).toBeInTheDocument();
      expect(within(card).getByText(/^\d+%$|^<1%$/)).toBeInTheDocument();
      expect(
        within(card).getByText("Monthly spending that holds up in 90% of histories"),
      ).toBeInTheDocument();
      expect(within(card).getByText(/Your goal is ₪4,000 a month/)).toBeInTheDocument();
      expect(within(card).getByText("How this works")).toBeInTheDocument();
    });

    it("explains the model in a section that starts closed", async () => {
      await saveProfileToDb(planned);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Risk analysis" });
      const details = within(card).getByText("How this works").closest("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
    });

    it("states the qualification and active assumptions outside the closed section", async () => {
      await saveProfileToDb(planned);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Risk analysis" });
      const qualifier = within(card).getByText(/not a guarantee/);
      expect(qualifier.closest("details")).toBeNull();
      expect(
        within(card).getByText(/Assumes 5% return, 2% inflation and [\d.]+% volatility a year\./),
      ).toBeInTheDocument();
    });

    it("shows high confidence for modest spending and low confidence for lavish spending", async () => {
      await saveProfileToDb(plan(1_500));
      await saveOnboardedToDb(true);
      const modest = renderWithProviders(<Projections />);
      const modestCard = await screen.findByRole("region", { name: "Risk analysis" });
      expect(within(modestCard).getByText(/^High confidence/)).toBeInTheDocument();
      modest.unmount();

      await saveProfileToDb(plan(25_000));
      renderWithProviders(<Projections />);
      const lavishCard = await screen.findByRole("region", { name: "Risk analysis" });
      expect(within(lavishCard).getByText(/^Low confidence/)).toBeInTheDocument();
    });

    it("links to Expenses when there is no target", async () => {
      await saveProfileToDb(buildTestProfile({ age: 55, retirementAge: 65 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Risk analysis" });
      expect(within(card).getByRole("link", { name: "Add expenses" })).toHaveAttribute(
        "href",
        "/my-data/expenses",
      );
      expect(within(card).queryByText(/Chance your desired spending lasts/)).not.toBeInTheDocument();
    });
  });

  describe("historical backtest", () => {
    const plan = (retirementMonthlyExpenses: number) =>
      buildTestProfile({
        age: 40,
        retirementAge: 67,
        gender: "male",
        monthlyGrossSalary: 20_000,
        investmentReturnPct: 5,
        inflationPct: 2,
        pensionBalances: [900_000, 300_000],
        retirementMonthlyExpenses,
      });

    async function renderBacktest(retirementMonthlyExpenses: number) {
      await saveProfileToDb(plan(retirementMonthlyExpenses));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: "Historical backtest" });
    }

    const fundedOf = (card: HTMLElement) => {
      const match = within(card)
        .getByText(/^\d+ of \d+$/)
        .textContent!.match(/^(\d+) of (\d+)$/)!;
      return { funded: Number(match[1]), total: Number(match[2]) };
    };

    // Year ranges are wrapped in invisible direction marks; text matchers look through them.
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));

    it("counts the starting years that fund the desired spending and finds the spending they all fund", async () => {
      const card = await renderBacktest(4_000);
      expect(within(card).getByText("Starting years that fund your spending to age 90")).toBeInTheDocument();
      expect(within(card).getByText("49 of 49")).toBeInTheDocument();
      expect(within(card).getByText("Your spending held up in every starting year.")).toBeInTheDocument();
      expect(within(card).queryByText(/nearly all/)).not.toBeInTheDocument();
      expect(within(card).getByText("No starting year ran short.")).toBeInTheDocument();
      expect(
        within(card).getByText("Monthly spending that every starting year could fund"),
      ).toBeInTheDocument();
      expect(within(card).getByText(/Your goal is ₪4,000 a month/)).toBeInTheDocument();
      expect(
        within(card).getByText(reads(/^Hardest start: \d{4}, replaying \d{4}–\d{4}\. It still left ₪/)),
      ).toBeInTheDocument();
    });

    it("lists the starting years that ran short and when the money first runs out", async () => {
      const card = await renderBacktest(20_000);
      expect(within(card).getByText(reads(/^Starting years that ran short: 19\d\d/))).toBeInTheDocument();
      expect(within(card).getByText(/Spending first goes unfunded at age \d+\./)).toBeInTheDocument();
      expect(fundedOf(card).funded).toBeLessThan(fundedOf(card).total);
    });

    it("explains itself in a section that starts closed and says it is US history", async () => {
      const card = await renderBacktest(4_000);
      const details = within(card).getByText("How this works").closest("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(within(card).getByText(/This is US history in US purchasing power/)).toBeInTheDocument();
      expect(within(card).getByText(/Aswath Damodaran/)).toBeInTheDocument();
    });

    it("starts at 60% stocks and replays again when the mix changes", async () => {
      const user = userEvent.setup();
      const card = await renderBacktest(20_000);
      const mix = within(card).getByLabelText("Stocks in the portfolio") as HTMLSelectElement;
      expect(mix.value).toBe("60");
      expect(within(card).getByRole("option", { name: "60% stocks, 40% bonds" })).toBeInTheDocument();
      const before = fundedOf(card).funded;

      await user.selectOptions(mix, "0");
      await waitFor(() => expect(fundedOf(card).funded).not.toBe(before));
      expect(within(card).getByText(/replaying/)).toBeInTheDocument();
    });

    it("can replay the history shifted to the plan's own return, which is lower here", async () => {
      const user = userEvent.setup();
      const card = await renderBacktest(14_000);
      const asHappened = within(card).getByRole("radio", { name: /As they happened/ });
      const matched = within(card).getByRole("radio", { name: /Matched to my plan/ });
      expect(asHappened).toBeChecked();
      const before = fundedOf(card).funded;

      await user.click(matched);
      await waitFor(() => expect(matched).toBeChecked());
      await waitFor(() => expect(fundedOf(card).funded).toBeLessThan(before));
    });

    it("compares the plan's return with what the mix returned", async () => {
      const card = await renderBacktest(4_000);
      expect(
        within(card).getByText(
          reads(/Your plan assumes \d+\.\d% a year after inflation\. This portfolio averaged \d+\.\d% over 1928–20\d\d\./),
        ),
      ).toBeInTheDocument();
    });

    it("explains why the backtest and the simulation can disagree when the history returned more than the plan", async () => {
      const card = await renderBacktest(4_000);
      expect(
        within(card).getByText(
          reads(
            /^Why the two risk tests can disagree: this test replays a portfolio of 60% stocks that averaged \d+\.\d% a year, above the \d+\.\d% your plan assumes\. The simulation earns your \d+\.\d% on average, so it starts from a lower return, and adds \d+(\.\d+)?% yearly volatility\.$/,
          ),
        ),
      ).toBeInTheDocument();
    });

    it("explains the disagreement differently when the history returned less than the plan", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          gender: "male",
          monthlyGrossSalary: 20_000,
          investmentReturnPct: 10,
          inflationPct: 2,
          pensionBalances: [900_000, 300_000],
          retirementMonthlyExpenses: 4_000,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      const card = await screen.findByRole("region", { name: "Historical backtest" });

      expect(
        within(card).getByText(
          reads(/a year, below the \d+\.\d% your plan assumes\. The simulation earns your \d+\.\d% on average, so it starts from a higher return/),
        ),
      ).toBeInTheDocument();
    });

    it("says both tests start from the same return once the history is matched to the plan", async () => {
      const user = userEvent.setup();
      const card = await renderBacktest(4_000);
      const matched = within(card).getByRole("radio", { name: /Matched to my plan/ });

      await user.click(matched);
      await waitFor(() =>
        expect(
          within(card).getByText(
            reads(/^Why the two risk tests can disagree: both start from about the same average return \((\d+\.\d)% in your plan, \1% here\)/),
          ),
        ).toBeInTheDocument(),
      );
      expect(within(card).queryByText(/so it starts from a lower return/)).not.toBeInTheDocument();
    });

    it("keeps each year range reading left to right inside a sentence", async () => {
      const card = await renderBacktest(20_000);
      const sentence = within(card).getByText(/^Starting years that ran short/).textContent!;
      expect(sentence).toMatch(/\u2066\d{4}(–\d{4})?\u2069/);
      const comparison = within(card).getByText(/This portfolio averaged/).textContent!;
      expect(comparison).toMatch(/\u20661928–20\d\d\u2069/);
    });

    it("links to Expenses when there is no target", async () => {
      await saveProfileToDb(buildTestProfile({ age: 55, retirementAge: 65 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = await screen.findByRole("region", { name: "Historical backtest" });
      expect(within(card).getByRole("link", { name: "Add expenses" })).toHaveAttribute(
        "href",
        "/my-data/expenses",
      );
      expect(within(card).queryByLabelText("Stocks in the portfolio")).not.toBeInTheDocument();
      expect(within(card).queryByText(/Starting years that fund/)).not.toBeInTheDocument();
    });
  });

  describe("liquidity ladder", () => {
    // Invisible direction marks wrap the year and the date; text matchers look through them.
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));

    const renderLadder = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: "When your money becomes usable" });
    };

    it("shows what is usable at retirement and what opens later, with a running total", async () => {
      const card = await renderLadder(
        buildTestProfile({
          age: 55,
          retirementAge: 55,
          otherAssets: 60_000,
          pensionBalances: [600_000],
          pensionAccountOverrides: [{ productCategory: "comprehensivePension" }],
          investmentReturnPct: 4,
          inflationPct: 4,
        }),
      );
      const rows = within(card).getAllByRole("row").slice(1);

      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText("When you retire")).toBeInTheDocument();
      expect(within(rows[0]).getByText("Investments (deposits, shares, cash)")).toBeInTheDocument();
      expect(within(rows[0]).getByText("₪60,000", { selector: "span.text-slate-500" })).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^Age 60 \(2031\)$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText("Pension Fund")).toBeInTheDocument();
      expect(within(rows[1]).getByText("₪660,000")).toBeInTheDocument();
      expect(within(card).queryByText(/yours/)).not.toBeInTheDocument();
    });

    it("says whose each line is for a couple", async () => {
      const card = await renderLadder(
        buildTestProfile({
          age: 40,
          retirementAge: 60,
          maritalStatus: "married",
          spouse: { age: 36, gender: "female", retirementAge: 55 },
          pensionBalances: [200_000, 100_000],
          pensionAccountOverrides: [
            { productCategory: "comprehensivePension" },
            { productCategory: "comprehensivePension", owner: "spouse" },
          ],
          investmentReturnPct: 4,
          inflationPct: 4,
        }),
      );

      expect(within(card).getByText("Pension Fund (yours)")).toBeInTheDocument();
      expect(within(card).getByText("Pension Fund (your spouse's)")).toBeInTheDocument();
    });

    it("warns about company shares that keep vesting after retirement", async () => {
      const card = await renderLadder(
        buildTestProfile({
          age: 50,
          retirementAge: 55,
          otherAssets: 10_000,
          equity: [
            {
              quantity: 100,
              priceUSD: 50,
              employerGrant: {
                keepsVestingAfterLeaving: true,
                vestingTranches: [{ vestDate: "2033-03-01", quantity: 100 }],
              },
            },
          ],
        }),
      );

      expect(
        within(card).getByText(reads(/^Company shares worth about ₪18,500 at today's price vest after you retire \(the first batch on 01\/03\/2033\)/)),
      ).toBeInTheDocument();
    });

    it("does not count company shares that vest after retirement and are lost", async () => {
      const card = await renderLadder(
        buildTestProfile({
          age: 50,
          retirementAge: 55,
          otherAssets: 10_000,
          equity: [
            {
              quantity: 100,
              priceUSD: 50,
              employerGrant: { vestingTranches: [{ vestDate: "2033-03-01", quantity: 100 }] },
            },
          ],
        }),
      );

      expect(within(card).queryByText(/Company shares worth about/)).not.toBeInTheDocument();
    });

    it("explains itself in a section that starts closed", async () => {
      const card = await renderLadder(buildTestProfile({ age: 50, retirementAge: 55, otherAssets: 10_000 }));
      const details = within(card).getByText("How this works").closest("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(within(card).getByText(/open at age 60/)).toBeInTheDocument();
    });

    it("is not shown when there are no savings", async () => {
      await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 55 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: "When your money becomes usable" })).not.toBeInTheDocument();
    });

    it("says that bank deposits are modeled as accessible investments, not by their own terms", async () => {
      const card = await renderLadder(
        buildTestProfile({
          age: 50,
          retirementAge: 55,
          bankDeposits: [
            {
              amount: 200_000,
              startDate: "2025-01-01",
              maturityDate: "2033-01-01",
              rateType: "fixed",
              annualInterestRatePercent: 4,
            },
          ],
        }),
      );

      const note = within(card).getByRole("note");
      expect(note).toHaveTextContent(/bank deposits are counted in .Investments \(deposits, shares, cash\)./i);
      expect(note).toHaveTextContent(/use at any time, growing at the plan's return/);
      expect(note).toHaveTextContent(/maturity date, early-withdrawal terms and renewal are not modeled individually/);
      expect(within(card).getByText(/including bank deposits/)).toBeInTheDocument();
    });

    it("does not mention bank deposits when none are entered", async () => {
      const card = await renderLadder(buildTestProfile({ age: 50, retirementAge: 55, otherAssets: 10_000 }));
      expect(within(card).queryByRole("note")).not.toBeInTheDocument();
    });
  });

  describe("unvested company shares", () => {
    // Invisible direction marks wrap the numbers; text matchers look through them.
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));

    const profileWith = (keepsVestingAfterLeaving: boolean) =>
      buildTestProfile({
        age: 50,
        retirementAge: 55,
        otherAssets: 10_000,
        pensionBalances: [400_000],
        equity: [
          {
            quantity: 300,
            priceUSD: 50,
            employerGrant: {
              keepsVestingAfterLeaving,
              vestingTranches: [
                { vestDate: "2031-12-01", quantity: 100 },
                { vestDate: "2032-06-01", quantity: 200 },
              ],
            },
          },
        ],
        investmentReturnPct: 4,
        inflationPct: 4,
      });

    const renderCard = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: "Leaving before your shares vest" });
    };

    it("says what is lost by retiring before the shares vest and what the next batch would add", async () => {
      const card = await renderCard(profileWith(false));

      expect(
        within(card).getByText(
          reads(/^If you retire on \d\d\/\d\d\/2031, you lose 300 shares of unvested company stock \(about ₪55,500\)\.$/),
        ),
      ).toBeInTheDocument();
      expect(
        within(card).getByText(
          reads(/^Staying \d+ months longer, until 01\/12\/2031, would keep another 100 shares \(about ₪18,500\)\./),
        ),
      ).toBeInTheDocument();
      expect(within(card).getByText(reads(/^That adds about ₪[\d,]+ a month to your net retirement income\.$/))).toBeInTheDocument();
    });

    it("explains itself in a section that starts closed", async () => {
      const card = await renderCard(profileWith(false));
      const details = within(card).getByText("How this works").closest("details");

      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
    });

    it("is not shown when the grant keeps vesting after leaving", async () => {
      await saveProfileToDb(profileWith(true));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "When your money becomes usable" });
      expect(screen.queryByRole("region", { name: "Leaving before your shares vest" })).not.toBeInTheDocument();
    });
  });

  describe("cover that ends when deposits stop", () => {
    const REGION = "Cover that ends when deposits stop";
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));

    const withCover = {
      accountStatus: "activeContributing" as const,
      insuranceCoverages: {
        deathCoverageAmount: 800_000,
        monthlyDisabilityAmount: null,
        monthlyRiskDeduction: 90,
        monthlySurvivorsSpousePension: 4_000,
        survivorSpousePercent: null,
      },
    };
    const profileWithCover = () =>
      buildTestProfile({
        age: 50,
        retirementAge: 55,
        investmentReturnPct: 0,
        inflationPct: 0,
        pensionBalances: [600_000],
        pensionAccountOverrides: [withCover],
      });

    const renderCard = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: REGION });
    };

    it("sets the three options side by side with the years left uncovered and the cost", async () => {
      const card = await renderCard(profileWithCover());

      expect(within(card).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "What it means",
        "Do nothing",
        "Keep the pension insurance",
        "Term life policy",
      ]);
      expect(within(card).getByRole("rowheader", { name: "Years without cover" })).toBeInTheDocument();
      expect(within(card).getByRole("rowheader", { name: "Cost per month" })).toBeInTheDocument();
      expect(within(card).getByRole("rowheader", { name: "Total cost" })).toBeInTheDocument();
      expect(within(card).getByText(reads(/^₪90 per month$/))).toBeInTheDocument();
      expect(within(card).getByText("Not known: enter it in My Data")).toBeInTheDocument();
      expect(within(card).queryByText("Your choice")).not.toBeInTheDocument();
    });

    it("saves the option the person chooses and marks it as the choice", async () => {
      const user = userEvent.setup();
      const card = await renderCard(profileWithCover());
      expect((await loadProfileFromDb())?.personal.coverPlan).toBeNull();

      await user.click(within(card).getByRole("button", { name: "Choose Keep the pension insurance for Your cover" }));

      await waitFor(async () =>
        expect((await loadProfileFromDb())?.personal.coverPlan?.option).toBe("keepPensionInsurance"),
      );
      expect(within(card).getByText("Your choice")).toBeInTheDocument();
      expect(
        within(card).queryByRole("button", { name: "Choose Keep the pension insurance for Your cover" }),
      ).not.toBeInTheDocument();
    });

    it("explains itself in a section that starts closed", async () => {
      const card = await renderCard(profileWithCover());
      const details = within(card).getByText("How this works").closest("details");

      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
    });

    it("is not shown when no cover is on file", async () => {
      await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 55, pensionBalances: [600_000] }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
    });

    it("is not shown when the cover already lasts to the age it is needed until", async () => {
      await saveProfileToDb({ ...profileWithCover(), personal: { ...profileWithCover().personal, retirementAge: 62 } });
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
    });
  });

  describe("withdrawal order", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));
    const REGION = "Which savings to draw on first";

    const mixed = {
      age: 60,
      retirementAge: 60,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [1_500_000, 600_000],
      pensionAccountOverrides: [{}, { productCategory: "studyFund" as const }],
      otherAssets: 400_000,
      retirementMonthlyExpenses: 9_000,
    };

    const renderOrder = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: REGION });
    };

    it("compares the three orders and marks the one in use", async () => {
      const card = await renderOrder(buildTestProfile(mixed));

      expect(within(card).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Over your retirement",
        expect.stringMatching(/^Evenly/),
        expect.stringMatching(/^Taxable money first/),
        expect.stringMatching(/^Lowest tax first/),
      ]);
      for (const label of [
        "Total tax",
        "Average income you keep",
        "Lowest income you keep",
        "First year below your desired spending",
        "Highest taxable income in a year",
      ]) {
        expect(within(card).getByRole("rowheader", { name: label })).toBeInTheDocument();
      }
      expect(within(card).getByRole("rowheader", { name: reads(/^Years above the surtax threshold \(₪721,560 a year\)$/) })).toBeInTheDocument();
      expect(within(card).getAllByText("In use")).toHaveLength(1);
      expect(within(card).queryByRole("button", { name: "Use the order: Evenly" })).not.toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Use the order: Lowest tax first" })).toBeInTheDocument();
      expect(within(card).getByText(/No order wins on every line/)).toBeInTheDocument();
    });

    it("saves the chosen order and shows it as in use", async () => {
      const user = userEvent.setup();
      const card = await renderOrder(buildTestProfile(mixed));
      expect((await loadProfileFromDb())?.assumptions.withdrawalStrategy).toBe("proRata");

      await user.click(within(card).getByRole("button", { name: "Use the order: Lowest tax first" }));

      await waitFor(async () =>
        expect((await loadProfileFromDb())?.assumptions.withdrawalStrategy).toBe("lowestTaxFirst"),
      );
      expect(within(card).queryByRole("button", { name: "Use the order: Lowest tax first" })).not.toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Use the order: Evenly" })).toBeInTheDocument();
      expect(within(card).getAllByText("In use")).toHaveLength(1);
    });

    it("shows the change from the order in use next to each other order", async () => {
      const card = await renderOrder(buildTestProfile(mixed));
      const taxRow = within(card).getByRole("rowheader", { name: "Total tax" }).closest("tr") as HTMLElement;
      const cells = within(taxRow).getAllByRole("cell");

      expect(cells).toHaveLength(3);
      // Only the orders that are not in use show a change, as a signed amount.
      expect(cells[0].textContent?.replace(BIDI_MARKS, "")).toMatch(/^₪[\d,]+$/);
      expect(cells[1].textContent?.replace(BIDI_MARKS, "")).toMatch(/^₪[\d,]+[+−]₪[\d,]+$/);
      expect(cells[2].textContent?.replace(BIDI_MARKS, "")).toMatch(/^₪[\d,]+[+−]₪[\d,]+$/);
    });

    it("says the choice does not matter when every order gives the same tax", async () => {
      const card = await renderOrder(
        buildTestProfile({ age: 60, retirementAge: 60, investmentReturnPct: 4, inflationPct: 4, pensionBalances: [500_000] }),
      );

      expect(within(card).getByText(/every order gives the same tax each year/)).toBeInTheDocument();
      expect(within(card).queryByRole("table")).not.toBeInTheDocument();
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    });

    it("leaves out the shortfall line when no desired spending is set", async () => {
      const card = await renderOrder(buildTestProfile({ ...mixed, retirementMonthlyExpenses: undefined }));

      expect(within(card).queryByRole("rowheader", { name: "First year below your desired spending" })).not.toBeInTheDocument();
    });

    it("explains itself in a section that starts closed", async () => {
      const card = await renderOrder(buildTestProfile(mixed));
      const details = within(card).getByText("How this works").closest("details");

      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(within(card).getByText(/do not depend on the order/)).toBeInTheDocument();
    });

    it("is not shown when there are no savings", async () => {
      await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 55 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
    });
  });

  describe("source costs", () => {
    const REGION = "What each source costs to draw on";
    // Invisible direction marks wrap the amounts and years; text matchers look through them.
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));
    const retired = { age: 60, retirementAge: 60, investmentReturnPct: 4, inflationPct: 4 };

    const renderCard = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: REGION });
    };

    it("shows the tax to raise ₪100 a month from each source, and what to draw to keep it", async () => {
      const card = await renderCard(
        buildTestProfile({
          ...retired,
          usdToIlsRate: { rate: 1 },
          equity: [
            { quantity: 1_000, priceUSD: 100, unrealizedCapitalGainUSD: 30_000, category: "personalBrokeragePurchase" },
          ],
          pensionBalances: [500_000],
          pensionAccountOverrides: [{ productCategory: "studyFund" }],
        }),
      );
      const rows = within(card).getAllByRole("row").slice(1);

      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText("Study Fund")).toBeInTheDocument();
      expect(within(rows[0]).getByText("No tax")).toBeInTheDocument();
      expect(within(rows[0]).getByText(reads(/^Usable from age 60 \(2026\)$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText("Investments (deposits, shares, cash)")).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^₪8 tax$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^Draw ₪108 to keep ₪100$/))).toBeInTheDocument();
      expect(within(card).getByRole("columnheader", { name: reads(/^Tax to raise ₪100 a month$/) })).toBeInTheDocument();
      expect(within(card).queryByText(/yours/)).not.toBeInTheDocument();
    });

    it("says what each kind of money gives up, in words", async () => {
      const card = await renderCard(
        buildTestProfile({
          ...retired,
          pensionBalances: [500_000, 200_000],
          pensionAccountOverrides: [{ productCategory: "studyFund" }, { productCategory: "comprehensivePension" }],
        }),
      );

      expect(within(card).getByText(/^Tax-free growth\./)).toBeInTheDocument();
      expect(within(card).getByText(/^Taxed as a pension\./)).toBeInTheDocument();
    });

    it("says that bank deposits are part of the investments it treats as usable at any time", async () => {
      const card = await renderCard(
        buildTestProfile({
          ...retired,
          bankDeposits: [{ amount: 200_000, startDate: "2025-01-01", maturityDate: "2033-01-01", rateType: "fixed" }],
        }),
      );

      expect(within(card).getByText(/treated as usable at any time/)).toBeInTheDocument();
      expect(within(card).getByRole("note")).toHaveTextContent(
        /maturity date, early-withdrawal terms and renewal are not modeled individually/,
      );
    });

    it("leaves the bank note out when no deposit is entered", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, otherAssets: 100_000 }));
      expect(within(card).queryByRole("note")).not.toBeInTheDocument();
    });

    it("says whose each line is for a couple", async () => {
      const card = await renderCard(
        buildTestProfile({
          age: 40,
          retirementAge: 60,
          maritalStatus: "married",
          spouse: { age: 36, gender: "female", retirementAge: 55 },
          pensionBalances: [200_000, 100_000],
          pensionAccountOverrides: [
            { productCategory: "comprehensivePension" },
            { productCategory: "comprehensivePension", owner: "spouse" },
          ],
          investmentReturnPct: 4,
          inflationPct: 4,
        }),
      );

      expect(within(card).getByText("Pension Fund (yours)")).toBeInTheDocument();
      expect(within(card).getByText("Pension Fund (your spouse's)")).toBeInTheDocument();
    });

    it("names employer shares by how their sale is taxed, and an investment provident fund on its own", async () => {
      const card = await renderCard(
        buildTestProfile({
          ...retired,
          usdToIlsRate: { rate: 1 },
          equity: [
            { quantity: 1_000, priceUSD: 100, employerGrant: { grantPriceUSD: 0 } },
            { quantity: 1_000, priceUSD: 100, employerGrant: { taxTrack: "section102OrdinaryIncomeTrustee" } },
          ],
          pensionBalances: [200_000],
          pensionAccountOverrides: [{ productCategory: "investmentProvidentFund" }],
        }),
      );

      expect(within(card).getByText("Investment provident fund")).toBeInTheDocument();
      expect(within(card).getByText("Employer shares (Section 102)")).toBeInTheDocument();
      expect(within(card).getByText("Employer shares (ordinary income)")).toBeInTheDocument();
      expect(within(card).getByText(/^All of it is taxed as salary/)).toBeInTheDocument();
    });

    it("shows the management fee only when one was entered", async () => {
      const fee = (feeFromAccumulationPercent: number | null) => ({
        investmentAndFees: {
          investmentTrackName: "",
          feeFromAccumulationPercent,
          feeFromDepositPercent: null,
          profitSharingFeePercent: null,
          hasStateYieldGuarantee: false,
        },
      });
      const card = await renderCard(
        buildTestProfile({
          ...retired,
          pensionBalances: [300_000, 100_000],
          pensionAccountOverrides: [
            { productCategory: "studyFund", ...fee(0.5) },
            { productCategory: "comprehensivePension", ...fee(null) },
          ],
        }),
      );
      const rows = within(card).getAllByRole("row").slice(1);

      expect(within(rows[0]).getByText(reads(/^Management fee 0\.5% a year of the balance$/))).toBeInTheDocument();
      expect(within(rows[1]).queryByText(/Management fee/)).not.toBeInTheDocument();
    });

    it("explains itself in a section that starts closed", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, otherAssets: 50_000 }));
      const details = within(card).getByText("How this works").closest("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(within(card).getByText(/not tax advice/)).toBeInTheDocument();
    });

    it("is not shown when there are no savings", async () => {
      await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 55 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
    });
  });

  describe("stress tests", () => {
    const REGION = "If things go wrong";
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const reads = (pattern: RegExp) => (content: string) => pattern.test(content.replace(BIDI_MARKS, ""));
    const retired = { age: 60, retirementAge: 60, investmentReturnPct: 4, inflationPct: 4, usdToIlsRate: { rate: 1 } };
    const employerShares = { quantity: 1_000, priceUSD: 100, employerGrant: {} };
    const ownShares = { quantity: 1_000, priceUSD: 100, category: "personalBrokeragePurchase" as const };

    const renderCard = async (profile: ReturnType<typeof buildTestProfile>) => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: REGION });
    };

    it("runs the plan again with the employer shares and the dollar falling", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [employerShares] }));
      const rows = within(card).getAllByRole("row").slice(1);

      expect(rows).toHaveLength(7);
      expect(within(rows[0]).getByText("Your plan now")).toBeInTheDocument();
      expect(within(rows[0]).getByText(reads(/^₪100,000$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^Employer shares fall 30%$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^₪70,000$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^-₪30,000 \(-30%\)$/))).toBeInTheDocument();
      expect(within(rows[2]).getByText(reads(/^Employer shares fall 50%$/))).toBeInTheDocument();
      expect(within(rows[3]).getByText(reads(/^Share markets fall 30%$/))).toBeInTheDocument();
      expect(within(rows[3]).getByText(reads(/^₪70,000$/))).toBeInTheDocument();
      expect(within(rows[4]).getByText(reads(/^The dollar falls 10% against the shekel$/))).toBeInTheDocument();
      expect(within(rows[5]).getByText(reads(/^The dollar falls 20% against the shekel$/))).toBeInTheDocument();
      expect(within(rows[5]).getByText(reads(/^₪80,000$/))).toBeInTheDocument();
      expect(
        within(rows[6]).getByText(reads(/^Both: employer shares fall 50% and the dollar falls 20%$/)),
      ).toBeInTheDocument();
      expect(within(rows[6]).getByText(reads(/^₪40,000$/))).toBeInTheDocument();
      expect(
        within(card).getByRole("columnheader", { name: "Monthly income after tax (lowest year)" }),
      ).toBeInTheDocument();
    });

    it("says how much of the savings is in dollars and how much of that is employer shares", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [employerShares, ownShares] }));

      expect(
        within(card).getByText(
          reads(
            /^₪200,000 of your savings are held in dollars: the shares you would still have when you start drawing, at today's prices and exchange rate\. Of that, ₪100,000 is employer shares\.$/,
          ),
        ),
      ).toBeInTheDocument();
    });

    it("shows only the dollar when none of the shares are the employer's", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [ownShares] }));
      const rows = within(card).getAllByRole("row").slice(1);

      expect(rows).toHaveLength(4);
      expect(within(card).queryByText(/Employer shares fall/)).not.toBeInTheDocument();
      expect(within(card).queryByText(/Both:/)).not.toBeInTheDocument();
      expect(within(card).queryByText(/is employer shares/)).not.toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^Share markets fall 30%$/))).toBeInTheDocument();
      expect(within(rows[2]).getByText(reads(/^The dollar falls 10% against the shekel$/))).toBeInTheDocument();
    });

    it("says whether the income still covers the desired spending", async () => {
      const covered = await renderCard(
        buildTestProfile({ ...retired, retirementMonthlyExpenses: 1, equity: [employerShares] }),
      );
      expect(within(covered).getAllByText("Covers your desired spending")).toHaveLength(7);
      expect(within(covered).queryByText(/Short of your desired spending/)).not.toBeInTheDocument();
    });

    it("says how far short the income falls of the desired spending", async () => {
      const card = await renderCard(
        buildTestProfile({ ...retired, retirementMonthlyExpenses: 1_000_000, equity: [employerShares] }),
      );

      expect(
        within(card).getAllByText(reads(/^Short of your desired spending by ₪[\d,]+ a month$/)),
      ).toHaveLength(7);
      expect(within(card).queryByText("Covers your desired spending")).not.toBeInTheDocument();
    });

    it("does not say anything about spending when none is entered", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [employerShares] }));

      expect(within(card).queryByText(/desired spending/)).not.toBeInTheDocument();
    });

    it("explains itself in a section that starts closed", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [employerShares] }));
      const details = within(card).getByText("How this works").closest("details");

      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(within(card).getByText(/not a forecast/)).toBeInTheDocument();
      expect(
        within(card).getByText(/Pension and provident fund tracks are not broken down into stocks and bonds/),
      ).toBeInTheDocument();
    });

    it("is not shown when there are no dollar holdings", async () => {
      await saveProfileToDb(buildTestProfile({ ...retired, otherAssets: 50_000 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
    });
  });

  describe("retirement scenario", () => {
    const planned = {
      age: 55,
      retirementAge: 65,
      monthlyGrossSalary: 20_000,
      pensionBalances: [1_500_000],
      retirementMonthlyExpenses: 9_000,
      otherAssets: 200_000,
      investmentReturnPct: 4,
      inflationPct: 4,
    };

    async function renderScenarios(overrides: Partial<typeof planned> = {}) {
      await saveProfileToDb(buildTestProfile({ ...planned, ...overrides }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return within(await screen.findByRole("region", { name: "Retirement scenario" }));
    }

    it("names each scenario with the retirement age it stands for", async () => {
      const selector = await renderScenarios();

      expect(selector.getByRole("button", { name: "Early – age 60" })).toBeInTheDocument();
      expect(selector.getByRole("button", { name: "Standard – age 65" })).toHaveAttribute("aria-pressed", "true");
      expect(selector.getByRole("button", { name: "Delayed – age 68" })).toHaveAttribute("aria-pressed", "false");
      expect(selector.queryByText(/never goes below age 60/i)).not.toBeInTheDocument();
    });

    it("says which scenario the charts and cards beneath it show, and follows the choice", async () => {
      const user = userEvent.setup();
      const selector = await renderScenarios();

      const timeline = within(await screen.findByRole("region", { name: "Retirement timeline" }));
      expect(timeline.getByText("Standard – age 65")).toBeInTheDocument();
      expect(timeline.getByRole("heading", { name: "Retirement timeline" })).toBeInTheDocument();
      const netWorth = screen.getByRole("heading", { name: "Net Worth Projection" }).parentElement!;
      expect(within(netWorth).getByText("Standard – age 65")).toBeInTheDocument();

      await user.click(selector.getByRole("button", { name: "Delayed – age 68" }));

      expect(selector.getByRole("button", { name: "Delayed – age 68" })).toHaveAttribute("aria-pressed", "true");
      expect(selector.getByRole("button", { name: "Standard – age 65" })).toHaveAttribute("aria-pressed", "false");
      expect(timeline.getByText("Delayed – age 68")).toBeInTheDocument();
      expect(within(netWorth).getByText("Delayed – age 68")).toBeInTheDocument();
      for (const name of ["Risk analysis", "Historical backtest", "Sustainable income by source"]) {
        const heading = screen.getByRole("heading", { name: new RegExp(`^${name}$`, "i") });
        expect(within(heading.parentElement!).getByText("Delayed – age 68")).toBeInTheDocument();
      }
    });

    it("separates the scenario choice from the age comparison", async () => {
      await renderScenarios();

      expect(screen.getByText(/do not follow this choice/i)).toBeInTheDocument();
      const comparison = within(screen.getByRole("region", { name: "Compare retirement ages" }));
      expect(comparison.getByText(/has its own ages/i)).toBeInTheDocument();
    });

    it("explains that Early does not go below the floor in these scenarios, and switches it off", async () => {
      const selector = await renderScenarios({ retirementAge: 60 });

      expect(selector.getByRole("button", { name: "Early – age 60" })).toBeDisabled();
      expect(selector.getByRole("button", { name: "Standard – age 60" })).toBeEnabled();
      expect(selector.getByRole("button", { name: "Delayed – age 63" })).toBeEnabled();
      expect(screen.getByText(/never goes below age 60/i)).toBeInTheDocument();
    });

    it("never makes Early later than the age the user chose", async () => {
      const selector = await renderScenarios({ retirementAge: 58 });

      expect(selector.getByRole("button", { name: "Early – age 58" })).toBeDisabled();
      expect(selector.getByRole("button", { name: "Standard – age 58" })).toBeEnabled();
    });

    it("leaves Early selectable while it differs from Standard", async () => {
      const selector = await renderScenarios();

      expect(selector.getByRole("button", { name: "Early – age 60" })).toBeEnabled();
    });

    it("compares three different ages by default, even for a plan to retire at 60", async () => {
      await saveProfileToDb(buildTestProfile({ ...planned, retirementAge: 60 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const comparison = within(await screen.findByRole("region", { name: "Compare retirement ages" }));
      expect(comparison.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
        "Age 55",
        "Age 60Your plan",
        "Age 63",
      ]);
    });
  });

  describe("plan bar", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const planned = {
      age: 55,
      retirementAge: 65,
      monthlyGrossSalary: 20_000,
      pensionBalances: [1_500_000],
      retirementMonthlyExpenses: 9_000,
      otherAssets: 200_000,
      investmentReturnPct: 4,
      inflationPct: 4,
      planningHorizonAge: 95 as const,
    };

    async function renderBar(overrides: Partial<typeof planned> = {}) {
      await saveProfileToDb(buildTestProfile({ ...planned, ...overrides }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return within(await screen.findByRole("region", { name: "Retirement scenario" }));
    }

    const facts = (bar: ReturnType<typeof within>) =>
      within(bar.getByRole("list", { name: "Plan summary" }))
        .getAllByRole("listitem")
        .map((item) => (item.textContent ?? "").replace(BIDI_MARKS, ""));

    it("states the retirement age, the planned spending and how far the savings reach", async () => {
      const bar = await renderBar({ pensionBalances: [6_000_000] });

      expect(facts(bar)).toEqual(["Retire at age 65", "Planned spending ₪9,000 a month", "Funded to age 95"]);
    });

    it("says when the savings run out before the planning horizon", async () => {
      const bar = await renderBar({ pensionBalances: [200_000], otherAssets: 0, retirementMonthlyExpenses: 20_000 });

      expect(facts(bar)[2]).toMatch(/^Savings run out at age \d+$/);
    });

    it("leaves out the spending figures when no spending is planned", async () => {
      const bar = await renderBar({ retirementMonthlyExpenses: 0 });

      expect(facts(bar)).toEqual(["Retire at age 65"]);
    });

    it("shows the figures of the chosen scenario", async () => {
      const user = userEvent.setup();
      const bar = await renderBar({ pensionBalances: [6_000_000] });

      await user.click(bar.getByRole("button", { name: "Delayed – age 68" }));

      expect(facts(bar)[0]).toBe("Retire at age 68");
    });

    it("remembers the chosen scenario when the page is left and opened again", async () => {
      const user = userEvent.setup();
      await saveProfileToDb(buildTestProfile(planned));
      await saveOnboardedToDb(true);
      renderWithProviders(
        <>
          <Link to="/away">Away</Link>
          <Link to="/">Back</Link>
          <Routes>
            <Route path="/" element={<Projections />} />
            <Route path="/away" element={<p>Elsewhere</p>} />
          </Routes>
        </>,
      );
      const bar = within(await screen.findByRole("region", { name: "Retirement scenario" }));
      await user.click(bar.getByRole("button", { name: "Delayed – age 68" }));

      await user.click(screen.getByRole("link", { name: "Away" }));
      expect(await screen.findByText("Elsewhere")).toBeInTheDocument();
      await user.click(screen.getByRole("link", { name: "Back" }));

      const again = within(await screen.findByRole("region", { name: "Retirement scenario" }));
      expect(again.getByRole("button", { name: "Delayed – age 68" })).toHaveAttribute("aria-pressed", "true");
      const timeline = within(await screen.findByRole("region", { name: "Retirement timeline" }));
      expect(timeline.getByText("Delayed – age 68")).toBeInTheDocument();
    });

    it("sits directly in the page, which is what lets it stay in view while the page scrolls", async () => {
      await renderBar();

      const region = screen.getByRole("region", { name: "Retirement scenario" });
      const page = screen.getByRole("heading", { level: 1, name: "Projections" }).parentElement;
      expect(region.parentElement).toBe(page);
      expect(region).toHaveAttribute("data-sticky-bar");
      expect(region).toHaveClass("md:sticky");
    });
  });

  describe("section index", () => {
    const planned = {
      age: 55,
      retirementAge: 65,
      monthlyGrossSalary: 20_000,
      pensionBalances: [1_500_000],
      otherAssets: 200_000,
      retirementMonthlyExpenses: 9_000,
      investmentReturnPct: 4,
      inflationPct: 4,
    };

    async function renderPage(overrides: Parameters<typeof buildTestProfile>[0] = {}) {
      await saveProfileToDb(
        buildTestProfile({
          ...planned,
          expenseItems: [
            { name: "Rent", amount: 6_000 },
            { name: "Holidays", amount: 24_000, frequency: "yearly" },
          ],
          ...overrides,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      await screen.findByRole("region", { name: "Retirement scenario" });
    }

    const index = () => within(screen.getByRole("navigation", { name: "Sections on this page" }));
    const group = (name: string) => screen.getByRole("group", { name });

    it("links each section of the page, in the order they appear, from the plan bar", async () => {
      await renderPage();

      const links = index().getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual([
        "Overview",
        "Income and tax",
        "Savings",
        "Spending",
        "Risk",
        "Retirement age",
      ]);
      const targets = links.map((link) => link.getAttribute("href")!.slice(1));
      expect(targets.map((id) => document.getElementById(id))).not.toContain(null);
      const order = [...document.querySelectorAll("[role=group][id^=projections-]")].map((el) => el.id);
      expect(order).toEqual(targets);
      expect(screen.getByRole("region", { name: "Retirement scenario" })).toContainElement(
        screen.getByRole("navigation", { name: "Sections on this page" }),
      );
    });

    it("titles each section and says which question it answers", async () => {
      await renderPage();

      expect(within(group("Overview")).getByText("What happens over the years?")).toBeInTheDocument();
      expect(within(group("Overview")).getByRole("heading", { level: 2, name: "Overview" })).toBeInTheDocument();
      expect(within(group("Risk")).getByText("How sure is it, and what could go wrong?")).toBeInTheDocument();
    });

    it("keeps the budget and the irregular costs together in the spending section", async () => {
      await renderPage();

      const spending = within(group("Spending"));
      expect(spending.getByRole("region", { name: "Retirement budget" })).toBeInTheDocument();
      expect(
        spending.getByRole("region", { name: "Irregular costs included in your monthly average" }),
      ).toBeInTheDocument();
    });

    it("keeps the retirement age comparisons in their own section, apart from the scenario", async () => {
      await renderPage();

      expect(within(group("Retirement age")).getByText(/do not follow the scenario above/i)).toBeInTheDocument();
    });

    it("leaves out the sections that have nothing to show", async () => {
      await renderPage({ otherAssets: 0, retirementMonthlyExpenses: 0, expenseItems: [] });

      expect(screen.queryByRole("group", { name: "Spending" })).not.toBeInTheDocument();
      expect(index().queryByRole("link", { name: "Spending" })).not.toBeInTheDocument();
      expect(index().getByRole("link", { name: "Risk" })).toBeInTheDocument();
    });

    it("returns to the top of the page and puts the focus on the page heading", async () => {
      const user = userEvent.setup();
      await renderPage();
      const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

      await user.click(within(group("Risk")).getByRole("button", { name: "Back to top" }));

      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
      expect(screen.getByRole("heading", { level: 1, name: "Projections" })).toHaveFocus();
      scrollTo.mockRestore();
    });
  });

  describe("retirement budget", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
    const profile = buildTestProfile({
      age: 55,
      retirementAge: 65,
      monthlyGrossSalary: 20_000,
      pensionBalances: [1_500_000],
      otherAssets: 200_000,
      investmentReturnPct: 4,
      inflationPct: 4,
      expenseItems: [
        { amount: 6_000, category: "housing", necessity: "essential" },
        { amount: 2_000, category: "food", necessity: "essential" },
        { amount: 1_000, category: "travel", necessity: "discretionary" },
      ],
    });
    const budget = () => screen.getByRole("region", { name: "Retirement budget" });
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
    const rowText = (name: string) =>
      within(budget()).getByRole("row", { name: new RegExp(name) }).textContent!.replace(BIDI_MARKS, "");

    it("compares the essential and the full budget with the income of the chosen scenario", async () => {
      const user = userEvent.setup();
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Retirement budget" });
      expect(within(budget()).getByText("Standard – age 65")).toBeInTheDocument();
      expect(rowText("Essential budget")).toContain("\u20aa8,000");
      expect(rowText("Full planned budget")).toContain("\u20aa9,000");
      const standardEssential = rowText("Essential budget");

      await user.click(
        within(screen.getByRole("region", { name: "Retirement scenario" })).getByRole("button", {
          name: "Delayed – age 68",
        }),
      );

      expect(within(budget()).getByText("Delayed – age 68")).toBeInTheDocument();
      expect(rowText("Essential budget")).not.toBe(standardEssential);
    });

    it("breaks the budget down by category, largest first, with the totals adding up", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Retirement budget" });
      expect(within(budget()).getByRole("heading", { name: "Where the budget goes" })).toBeInTheDocument();
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

    it("draws a bar under each category, sized against the largest and split by necessity", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Retirement budget" });
      const bar = (name: string) =>
        within(budget())
          .getByRole("row", { name: new RegExp(`^${name}`) })
          .querySelector("th [aria-hidden='true']") as HTMLElement;
      expect(bar("Housing").style.width).toBe("100%");
      expect(bar("Food and household").style.width).toBe("30%");
      expect(bar("Personal and lifestyle").style.width).toBe("20%");
      expect(bar("Travel and leisure").style.width).toBe("4%");
      const [essential, discretionary] = Array.from(bar("Personal and lifestyle").children) as HTMLElement[];
      expect(essential.style.flexGrow).toBe("0");
      expect(discretionary.style.flexGrow).toBe("1000");
      expect(discretionary.style.backgroundImage).toContain("repeating-linear-gradient");
    });

    it("is the target of the Dashboard's link to the budget by category", async () => {
      await saveProfileToDb(itemised);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      expect(await screen.findByRole("region", { name: "Retirement budget" })).toHaveAttribute(
        "id",
        "retirement-budget",
      );
    });

    it("is not shown when no spending has been entered", async () => {
      await saveProfileToDb(buildTestProfile({ age: 55, retirementAge: 65, pensionBalances: [1_500_000] }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Retirement scenario" });
      expect(screen.queryByRole("region", { name: "Retirement budget" })).not.toBeInTheDocument();
    });
  });

  describe("irregular costs", () => {
    const BIDI_MARKS = /[\u2066\u2069]/g;
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
    const card = () => screen.getByRole("region", { name: "Irregular costs included in your monthly average" });
    const rowText = (name: string) =>
      within(card()).getByRole("row", { name: new RegExp(name) }).textContent!.replace(BIDI_MARKS, "");

    it("lists the payments made once a year or less often, with how often and what each adds", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Irregular costs included in your monthly average" });
      expect(rowText("Holidays")).toBe("Holidays\u20aa24,000Once a year\u20aa2,000");
      expect(rowText("Car replacement")).toBe("Car replacement\u20aa60,000Every 5 years\u20aa1,000");
      expect(within(card()).queryByRole("row", { name: /Rent|Arnona/ })).not.toBeInTheDocument();
      expect(rowText("Total in your monthly average")).toBe("Total in your monthly average\u20aa3,000");
    });

    it("says it is an average, not a schedule, and what share of the spending it is", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Irregular costs included in your monthly average" });
      const text = card().textContent!.replace(BIDI_MARKS, "");
      expect(text).toContain("This is an average, not a payment schedule");
      expect(text).toContain("the plan does not know when any of them falls due");
      // 3,000 of the 9,900 a month
      expect(text).toContain("30% of your planned monthly spending.");
    });

    it("states the cash the largest payment needs when it falls due", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Irregular costs included in your monthly average" });
      expect(card().textContent!.replace(BIDI_MARKS, "")).toContain(
        "The largest single payment is \u20aa60,000 (Car replacement).",
      );
    });

    it("is the target of the planned spending figure's link on the Dashboard", async () => {
      await saveProfileToDb(profile);
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      expect(
        await screen.findByRole("region", { name: "Irregular costs included in your monthly average" }),
      ).toHaveAttribute("id", "irregular-costs");
    });

    it("shows the payments hidden in the monthly average, apart from the chosen scenario", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 55,
          retirementAge: 65,
          pensionBalances: [1_500_000],
          expenseItems: [
            { name: "Rent", amount: 6_000 },
            { name: "Holidays", amount: 24_000, frequency: "yearly" },
          ],
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const card = within(await screen.findByRole("region", { name: "Irregular costs included in your monthly average" }));
      expect(card.getByRole("row", { name: /Holidays/ }).textContent!.replace(/[\u2066\u2069]/g, "")).toBe(
        "Holidays\u20aa24,000Once a year\u20aa2,000",
      );
      expect(card.getByText(/not a payment schedule/)).toBeInTheDocument();
      expect(card.queryByText("Standard – age 65")).not.toBeInTheDocument();
    });

    it("is not shown when every cost is regular", async () => {
      await saveProfileToDb(
        buildTestProfile({ age: 55, retirementAge: 65, pensionBalances: [1_500_000], retirementMonthlyExpenses: 9_000 }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("region", { name: "Retirement scenario" });
      expect(
        screen.queryByRole("region", { name: "Irregular costs included in your monthly average" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("balance path", () => {
    const annuityParameters = {
      hasGuaranteedFactor: false,
      conversionFactor: 200,
      estimatedMonthlyAnnuity: null,
      annuityTaxType: null,
      guaranteedPaymentMonths: null,
    };
    const planned = {
      age: 50,
      retirementAge: 60,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [400_000, 100_000],
      pensionAccountOverrides: [
        { productCategory: "pensionFund" as const, annuityParameters },
        { productCategory: "studyFund" as const },
      ],
      otherAssets: 50_000,
      retirementMonthlyExpenses: 3_000,
    };

    async function renderPlan(overrides: Partial<typeof planned> & Record<string, unknown> = {}) {
      await saveProfileToDb(buildTestProfile({ ...planned, ...overrides }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      const heading = await screen.findByRole("heading", { name: "Net Worth Projection" });
      return heading.parentElement!.parentElement!.parentElement!;
    }

    const plain = (element: HTMLElement) => element.textContent!.replace(/[\u2066\u2069]/g, "");

    it("explains the steps in the line: drawing starts and a pension becomes an annuity", async () => {
      const card = await renderPlan();

      const events = within(card).getByRole("region", { name: "What shapes this path" });
      const items = within(events).getAllByRole("listitem");
      expect(items).toHaveLength(1);
      expect(plain(items[0])).toContain("Age 60: you retire and start drawing on your savings.");
      expect(plain(items[0])).toMatch(
        /Age 60: Pension Fund\. The ₪[\d,]+ of capital becomes an annuity of ₪[\d,]+ a month\. It is paid out as monthly income, so it is no longer a balance you can spend/,
      );
      expect(items[0]).toHaveTextContent("1");
    });

    it("words the retirement for a household", async () => {
      const card = await renderPlan({
        maritalStatus: "married",
        spouse: { age: 48, retirementAge: 62 },
      });

      const events = within(card).getByRole("region", { name: "What shapes this path" });
      expect(plain(events)).toContain(
        "the later of you two has retired, and the household starts drawing on its savings.",
      );
    });

    it("says why the line starts above today's total when employer shares have not vested yet, in the chart and the table", async () => {
      const user = userEvent.setup();
      const inYears = (years: number) =>
        new Date(Date.now() + years * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const card = await renderPlan({
        age: 55,
        retirementAge: 65,
        equity: [
          {
            quantity: 500,
            priceUSD: 50,
            employerGrant: { vestingTranches: [{ vestDate: inYears(9.5), quantity: 400 }] },
          },
        ],
      });

      const note = "₪74,000 of employer shares have not vested yet. They vest at age 64";
      expect(plain(within(card).getByRole("region", { name: "What shapes this path" }))).toContain(note);

      await user.click(within(card).getByRole("button", { name: "Show as table" }));
      expect(plain(card)).toContain(note);
    });

    it("lists only the retirement when no savings become an annuity", async () => {
      const card = await renderPlan({
        pensionBalances: [100_000],
        pensionAccountOverrides: [{ productCategory: "studyFund" as const }],
      });

      const events = within(card).getByRole("region", { name: "What shapes this path" });
      expect(plain(events)).toContain("Age 60: you retire and start drawing on your savings.");
      expect(plain(events)).not.toContain("becomes an annuity");
    });

    it("shows the table with the balance of each source and a total", async () => {
      const user = userEvent.setup();
      const card = await renderPlan();

      await user.click(within(card).getByRole("button", { name: "Show as table" }));

      const table = within(card).getByRole("table");
      const headers = within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent);
      expect(headers).toEqual(["Age", "Pension Fund", "Study Fund", "Investments (deposits, shares, cash)", "Total"]);
      const first = within(table).getAllByRole("row")[1];
      const cells = within(first).getAllByRole("cell");
      const amounts = cells.slice(1).map((cell) => Number(cell.textContent!.replace(/[₪,]/g, "")));
      expect(cells[0]).toHaveTextContent("50");
      expect(amounts[0] + amounts[1] + amounts[2]).toBe(amounts[3]);
      expect(table.closest(".overflow-auto, .overflow-y-auto, [class*='max-h-']")).toBeNull();
      expect(within(card).queryByRole("region", { name: "What shapes this path" })).not.toBeInTheDocument();
    });

    it("says the table is end-of-year, drops annuity capital, and pools the investments", async () => {
      const user = userEvent.setup();
      const card = await renderPlan();

      await user.click(within(card).getByRole("button", { name: "Show as table" }));

      expect(within(card).getByText(/Balances are at the end of each year, in today's money\./)).toBeInTheDocument();
      expect(within(card).getByText(/no longer a balance: it is paid out as monthly income/)).toBeInTheDocument();
      expect(plain(card)).toContain(
        "Bank deposits, shares and other holdings are modeled as one investments pool, shown in the Investments (deposits, shares, cash) column.",
      );
    });

    it("leaves out the pool note and column when there are no investments", async () => {
      const user = userEvent.setup();
      const card = await renderPlan({ otherAssets: 0 });

      await user.click(within(card).getByRole("button", { name: "Show as table" }));

      expect(within(card).queryByText(/modeled as one investments pool/)).not.toBeInTheDocument();
      expect(
        within(within(card).getByRole("table"))
          .getAllByRole("columnheader")
          .map((header) => header.textContent),
      ).toEqual(["Age", "Pension Fund", "Study Fund", "Total"]);
    });
  });

  describe("cash flow by year", () => {
    // 0% real return: 120,000 pays 12,000 a year for ten years, so 1,000 a month runs out at 77.
    const retiring = {
      age: 66,
      retirementAge: 67,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [120_000],
    };
    const plain = (element: HTMLElement) => element.textContent!.replace(/[\u2066\u2069]/g, "");

    async function renderPlan(monthlyExpenses?: number) {
      await saveProfileToDb(buildTestProfile({ ...retiring, retirementMonthlyExpenses: monthlyExpenses }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      await screen.findByRole("heading", { name: "Net Worth Projection" });
    }

    it("shows the cash flow at the planned spending and links to it from the net-worth chart when unfunded", async () => {
      await renderPlan(1_000);

      const card = screen.getByRole("region", { name: "Cash flow by year" });
      expect(plain(card)).toContain("₪1,000 a month");
      expect(plain(card)).toMatch(/fully covered up to age 76/);
      const link = screen.getByRole("link", { name: "See the year-by-year cash flow" });
      expect(link).toHaveAttribute("href", "#cash-flow");
    });

    it("has no link to the cash flow when the planned spending is covered", async () => {
      await renderPlan(100);

      expect(screen.getByRole("region", { name: "Cash flow by year" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "See the year-by-year cash flow" })).not.toBeInTheDocument();
    });

    it("leaves out the cash flow when no spending is entered", async () => {
      await renderPlan();

      expect(screen.queryByRole("region", { name: "Cash flow by year" })).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "What the timeline shows" })).not.toBeInTheDocument();
    });

    it("breaks the net-worth chart into the kinds of savings", async () => {
      await renderPlan(1_000);

      const card = screen.getByRole("heading", { name: "Net Worth Projection" }).parentElement!.parentElement!
        .parentElement!;
      expect(within(card).getAllByText("Pension Fund").length).toBeGreaterThan(0);
    });

    it("lets the timeline switch from the sustainable income to the planned spending", async () => {
      const user = userEvent.setup();
      await renderPlan(1_000);

      const timeline = screen.getByRole("region", { name: "Retirement timeline" });
      const sustainable = within(timeline).getByRole("button", { name: "Sustainable income" });
      const planned = within(timeline).getByRole("button", { name: "At my planned spending" });
      expect(sustainable).toHaveAttribute("aria-pressed", "true");
      expect(planned).toHaveAttribute("aria-pressed", "false");
      expect(within(timeline).queryByText(/Unfunded/)).not.toBeInTheDocument();

      await user.click(planned);

      expect(planned).toHaveAttribute("aria-pressed", "true");
      expect(sustainable).toHaveAttribute("aria-pressed", "false");
      expect(plain(timeline)).toContain("Your planned spending of ₪1,000 a month, year by year, before tax");
      expect(within(timeline).getByText(/Unfunded\s*₪/)).toBeInTheDocument();
      expect(within(timeline).queryByText(/does not change when you change it/)).not.toBeInTheDocument();

      await user.click(sustainable);

      expect(within(timeline).queryByText(/Unfunded/)).not.toBeInTheDocument();
      expect(within(timeline).getByText(/does not change when you change it/)).toBeInTheDocument();
    });
  });

  describe("what the risk tests rest on", () => {
    const REGION = "What the risk tests rest on";
    const plain = (element: HTMLElement) => element.textContent!.replace(/[\u2066\u2069]/g, "");
    const retired = {
      age: 60,
      retirementAge: 60,
      investmentReturnPct: 5,
      inflationPct: 3,
      usdToIlsRate: { rate: 1 },
      retirementMonthlyExpenses: 5_000,
    };
    const employerShares = { quantity: 1_000, priceUSD: 100, employerGrant: {} };
    const ownShares = { quantity: 1_000, priceUSD: 100, category: "personalBrokeragePurchase" as const };

    const renderPlan = async (overrides: Record<string, unknown> = {}) => {
      await saveProfileToDb(buildTestProfile({ ...retired, ...overrides }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: REGION });
    };

    it("says the risk analysis applies one return and swing to all savings, not to each holding", async () => {
      const card = await renderPlan({ equity: [ownShares] });

      expect(plain(card)).toContain("do not replay your bank deposits, shares and pension investments one by one");
      expect(plain(card)).toContain(
        "All your savings earn the plan's 5% a year before inflation, with a typical market swing of 12% a year.",
      );
      expect(plain(card)).toContain("not the return of each of your own holdings");
      expect(within(card).getByRole("link", { name: "Change assumptions" })).toHaveAttribute(
        "href",
        "/my-data/assumptions",
      );
    });

    it("calls the backtest portfolio hypothetical and not a reconstruction of the holdings", async () => {
      const user = userEvent.setup();
      const card = await renderPlan({ equity: [ownShares] });

      expect(plain(card)).toContain(
        "A hypothetical portfolio of US stocks and bonds, starting at 60% stocks and 40% bonds.",
      );
      expect(plain(card)).toContain("It is a model, not a reconstruction of what you own.");

      const mix = await screen.findByLabelText("Stocks in the portfolio");
      expect(mix).toHaveAccessibleDescription("A hypothetical model portfolio. It is not based on your own holdings.");
      await user.selectOptions(mix, "80% stocks, 20% bonds");
      expect(mix).toHaveAccessibleDescription("A hypothetical model portfolio. It is not based on your own holdings.");
    });

    it("names the dollar and employer-share exposure and links to the stress cases", async () => {
      const card = await renderPlan({ equity: [employerShares, ownShares] });

      expect(plain(card)).toContain(
        "Your dollar holdings. ₪200,000 of your savings are held in dollars: the shares you would still have when you start drawing, at today's prices and exchange rate. Of that, ₪100,000 is employer shares. Neither test treats them differently from your shekel savings.",
      );
      const link = within(card).getByRole("link", { name: "See what a fall would do" });
      expect(link).toHaveAttribute("href", "#stress-test");
      expect(screen.getByRole("region", { name: "If things go wrong" })).toHaveAttribute("id", "stress-test");
    });

    it("leaves out the employer line when none of the dollar holdings are employer shares", async () => {
      const card = await renderPlan({ equity: [ownShares] });

      expect(plain(card)).toContain(
        "₪100,000 of your savings are held in dollars: the shares you would still have when you start drawing, at today's prices and exchange rate.",
      );
      expect(plain(card)).not.toContain("employer shares");
    });

    it("leaves out the dollar line when there are no dollar holdings", async () => {
      const card = await renderPlan({ otherAssets: 50_000 });

      expect(plain(card)).not.toContain("Your dollar holdings");
      expect(within(card).queryByRole("link", { name: "See what a fall would do" })).not.toBeInTheDocument();
      expect(plain(card)).toContain("All your savings earn the plan's 5% a year");
    });

    it("is not shown while there is no desired spending to test", async () => {
      await saveProfileToDb(buildTestProfile({ ...retired, retirementMonthlyExpenses: undefined, equity: [ownShares] }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
    });
  });

  describe("planning horizon and longevity", () => {
    const REGION = "If you live longer";
    const plain = (element: HTMLElement) => element.textContent!.replace(/[\u2066\u2069]/g, "");
    // 0% real return: 400,000 pays 1,000 a month for 33 years, so it lasts past 90 but not to 95.
    const retired = {
      age: 60,
      retirementAge: 60,
      investmentReturnPct: 4,
      inflationPct: 4,
      pensionBalances: [400_000],
      retirementMonthlyExpenses: 1_000,
    };

    const renderCard = async (overrides: Record<string, unknown> = {}) => {
      await saveProfileToDb(buildTestProfile({ ...retired, ...overrides }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);
      return screen.findByRole("region", { name: REGION });
    };

    it("reruns the plan to 90, 95 and 100 and marks the age the plan uses", async () => {
      const card = await renderCard();
      const rows = within(card).getAllByRole("row").slice(1);

      expect(rows).toHaveLength(3);
      expect(plain(rows[0])).toContain("Age 90");
      expect(plain(rows[0])).toContain("Your plan now");
      expect(plain(rows[1])).toContain("Age 95");
      expect(plain(rows[1])).not.toContain("Your plan now");
      expect(plain(rows[2])).toContain("Age 100");
      expect(plain(rows[1])).toMatch(/-₪[\d,]+ a month compared with your plan/);
      expect(card).toHaveAttribute("id", "longevity-test");
    });

    it("says when the desired spending outlasts the savings at a later age", async () => {
      const card = await renderCard();
      const rows = within(card).getAllByRole("row").slice(1);

      expect(plain(rows[0])).toContain("Your usable savings cover it to age 90");
      expect(plain(rows[1])).toMatch(/Your usable savings run out at age 9[0-4]/);
      expect(plain(rows[2])).toMatch(/Your usable savings run out at age 9[0-4]/);
    });

    it("leaves out the spending column when no spending is entered", async () => {
      const card = await renderCard({ retirementMonthlyExpenses: undefined });

      expect(within(card).queryByRole("columnheader", { name: "Your desired spending" })).not.toBeInTheDocument();
      expect(within(card).getAllByRole("row")).toHaveLength(4);
    });

    it("marks 95 as the plan's age when the plan is set to run to 95", async () => {
      const card = await renderCard({ planningHorizonAge: 95 });
      const rows = within(card).getAllByRole("row").slice(1);

      expect(plain(rows[0])).not.toContain("Your plan now");
      expect(plain(rows[1])).toContain("Your plan now");
      expect(plain(rows[0])).toMatch(/\+₪[\d,]+ a month compared with your plan/);
      expect(plain(rows[0])).toContain("Your usable savings cover it to age 90");
    });

    it("explains in a closed section that lifelong payments do not shrink", async () => {
      const card = await renderCard();

      const details = within(card).getByText("How this works").closest("details");
      expect(details).not.toHaveAttribute("open");
      expect(plain(card)).toContain("paid for life, so they do not shrink with a longer life");
    });

    it("runs the other charts and cards to the chosen age", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 40,
          retirementAge: 67,
          gender: "male",
          monthlyGrossSalary: 20_000,
          investmentReturnPct: 5,
          inflationPct: 2,
          pensionBalances: [900_000, 300_000],
          retirementMonthlyExpenses: 4_000,
          planningHorizonAge: 95,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const risk = await screen.findByRole("region", { name: "Risk analysis" });
      expect(within(risk).getByText("Chance your desired spending lasts to age 95")).toBeInTheDocument();
      expect(screen.getByRole("note", { name: "Assumptions in use" }).textContent!.replace(/[\u2066\u2069]/g, "")).toContain(
        "Plan runs to age 95.",
      );
    });

    it("says the lifelong payments carry on after the age the income chart stops at", async () => {
      await saveProfileToDb(
        buildTestProfile({
          age: 60,
          retirementAge: 60,
          investmentReturnPct: 4,
          inflationPct: 4,
          pensionBalances: [600_000],
          bituachLeumi: { includeInProjection: true, monthlyPensionOverride: 2_000 },
          planningHorizonAge: 95,
        }),
      );
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      const notes = await screen.findAllByText(
        (content) => /still pay ₪[\d,]+ a month at age 95, before tax, and keep paying after it/.test(content.replace(/[\u2066\u2069]/g, "")),
      );
      expect(notes.length).toBeGreaterThan(0);
    });
  });

  it("names the assumptions every chart on the page rests on", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 40, retirementAge: 67, otherAssets: 300_000, investmentReturnPct: 8, inflationPct: 1.5 }),
    );
    await saveOnboardedToDb(true);
    renderWithProviders(<Projections />);

    const summary = await screen.findByRole("note", { name: "Assumptions in use" });
    const text = summary.textContent!.replace(/[\u2066\u2069]/g, "");
    expect(text).toContain("Optimistic");
    expect(text).toContain("Investment return 8% (before inflation), the same for every asset, inflation 1.5%, market volatility 12%. All per year.");
    expect(within(summary).getByRole("link", { name: "Change assumptions" })).toHaveAttribute(
      "href",
      "/my-data/assumptions",
    );
  });
});
