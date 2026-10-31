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
});
