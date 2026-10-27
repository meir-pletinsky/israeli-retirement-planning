import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
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
  });
});
