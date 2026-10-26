import { screen, within } from "@testing-library/react";
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
});
