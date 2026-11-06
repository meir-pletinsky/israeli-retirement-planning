import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

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
    expect(within(rows[0]).getByText("Other Investments")).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Income After Tax" })).toBeInTheDocument();
    expect(
      screen.getByText(/split into what you keep and the income tax paid/i),
    ).toBeInTheDocument();
  });

  it("leaves out the after-tax chart when there is no retirement income", async () => {
    await saveProfileToDb(buildTestProfile({ age: 62, retirementAge: 62 }));
    await saveOnboardedToDb(true);

    renderWithProviders(<Projections />);

    expect(await screen.findByText("Income by Source")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Income After Tax" })).not.toBeInTheDocument();
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
      expect(within(rows[0]).getByText("Other Investments")).toBeInTheDocument();
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
      expect(within(rows[1]).getByText("Other Investments")).toBeInTheDocument();
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

      expect(rows).toHaveLength(6);
      expect(within(rows[0]).getByText("Your plan now")).toBeInTheDocument();
      expect(within(rows[0]).getByText(reads(/^₪100,000$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^Employer shares fall 30%$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^₪70,000$/))).toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^-₪30,000 \(-30%\)$/))).toBeInTheDocument();
      expect(within(rows[2]).getByText(reads(/^Employer shares fall 50%$/))).toBeInTheDocument();
      expect(within(rows[3]).getByText(reads(/^The dollar falls 10% against the shekel$/))).toBeInTheDocument();
      expect(within(rows[4]).getByText(reads(/^The dollar falls 20% against the shekel$/))).toBeInTheDocument();
      expect(within(rows[4]).getByText(reads(/^₪80,000$/))).toBeInTheDocument();
      expect(
        within(rows[5]).getByText(reads(/^Both: employer shares fall 50% and the dollar falls 20%$/)),
      ).toBeInTheDocument();
      expect(within(rows[5]).getByText(reads(/^₪40,000$/))).toBeInTheDocument();
      expect(
        within(card).getByRole("columnheader", { name: "Monthly income after tax (lowest year)" }),
      ).toBeInTheDocument();
    });

    it("says how much of the savings is in dollars and how much of that is employer shares", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [employerShares, ownShares] }));

      expect(
        within(card).getByText(
          reads(/^₪200,000 of your savings when you start drawing are held in dollars\. Of that, ₪100,000 is employer shares\.$/),
        ),
      ).toBeInTheDocument();
    });

    it("shows only the dollar when none of the shares are the employer's", async () => {
      const card = await renderCard(buildTestProfile({ ...retired, equity: [ownShares] }));
      const rows = within(card).getAllByRole("row").slice(1);

      expect(rows).toHaveLength(3);
      expect(within(card).queryByText(/Employer shares fall/)).not.toBeInTheDocument();
      expect(within(card).queryByText(/Both:/)).not.toBeInTheDocument();
      expect(within(card).queryByText(/is employer shares/)).not.toBeInTheDocument();
      expect(within(rows[1]).getByText(reads(/^The dollar falls 10% against the shekel$/))).toBeInTheDocument();
    });

    it("says whether the income still covers the desired spending", async () => {
      const covered = await renderCard(
        buildTestProfile({ ...retired, retirementMonthlyExpenses: 1, equity: [employerShares] }),
      );
      expect(within(covered).getAllByText("Covers your desired spending")).toHaveLength(6);
      expect(within(covered).queryByText(/Short of your desired spending/)).not.toBeInTheDocument();
    });

    it("says how far short the income falls of the desired spending", async () => {
      const card = await renderCard(
        buildTestProfile({ ...retired, retirementMonthlyExpenses: 1_000_000, equity: [employerShares] }),
      );

      expect(
        within(card).getAllByText(reads(/^Short of your desired spending by ₪[\d,]+ a month$/)),
      ).toHaveLength(6);
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
    });

    it("is not shown when there are no dollar holdings", async () => {
      await saveProfileToDb(buildTestProfile({ ...retired, otherAssets: 50_000 }));
      await saveOnboardedToDb(true);
      renderWithProviders(<Projections />);

      await screen.findByRole("heading", { name: "Projections" });
      expect(screen.queryByRole("region", { name: REGION })).not.toBeInTheDocument();
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
    expect(text).toContain("Investment return 8% (before inflation), inflation 1.5%, market volatility 12%. All per year.");
    expect(within(summary).getByRole("link", { name: "Change assumptions" })).toHaveAttribute(
      "href",
      "/my-data/assumptions",
    );
  });
});
