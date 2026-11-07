import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { PensionSavingsStep } from "../pages/MyData/PensionSavingsStep";
import { EquityStep } from "../pages/MyData/EquityStep";
import { ProfileProvider } from "../app/ProfileContext";
import { clearAllData, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import "../i18n";
import { PORTFOLIO_INPUT_TARGET } from "./portfolioInputTargets";

beforeEach(async () => {
  await clearAllData();
  await saveProfileToDb(
    buildTestProfile({
      age: 50,
      retirementAge: 67,
      pensionBalances: [500_000],
      otherAssets: 20_000,
      bankDeposits: [{ amount: 200_000 }],
      usdToIlsRate: { rate: 3 },
      equity: [{ quantity: 100, priceUSD: 10, employerGrant: {} }],
    }),
  );
});

function targetsOn(path: string): string[] {
  return [...new Set(Object.values(PORTFOLIO_INPUT_TARGET))]
    .filter((target) => target.startsWith(`${path}#`))
    .map((target) => target.slice(path.length + 1));
}

function renderStep(path: string, step: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProfileProvider>{step}</ProfileProvider>
    </MemoryRouter>,
  );
}

describe("Portfolio summary links land on a section of the step they name", () => {
  it("every Pension & Savings target exists on that step", async () => {
    renderStep("/my-data/pension-savings", <PensionSavingsStep />);
    await screen.findByRole("button", { name: "Add account" });

    const ids = targetsOn("/my-data/pension-savings");
    expect(ids).toEqual(expect.arrayContaining(["pension-summary", "other-assets"]));
    for (const id of ids) expect(document.getElementById(id), id).not.toBeNull();
    expect(document.getElementById("other-assets")?.tagName).toBe("INPUT");
  });

  it("every Equity & Investments target exists on that step, deposits included", async () => {
    renderStep("/my-data/equity", <EquityStep />);
    await screen.findByRole("button", { name: "Add ESPP purchase" });

    const ids = targetsOn("/my-data/equity");
    expect(ids).toEqual(
      expect.arrayContaining([
        "bank-deposits-summary",
        "equity-summary-employerGrantedStock",
        "equity-summary-employerEsppDiscount",
      ]),
    );
    for (const id of ids) expect(document.getElementById(id), id).not.toBeNull();
  });

  it("sends bank deposits to the Equity & Investments step, where they are entered", () => {
    expect(PORTFOLIO_INPUT_TARGET.bankDeposits.startsWith("/my-data/equity#")).toBe(true);
  });
});
