import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";

beforeEach(async () => {
  await clearAllData();
});

describe("EquityStep — vesting tranches", () => {
  it("adds, saves and removes vesting batches of an employer grant", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    await user.selectOptions(
      screen.getByLabelText(/^Investment category/),
      "employerGrantedStock",
    );
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "100");

    // Two batches, then remove the first.
    await user.click(screen.getByRole("button", { name: "Add batch" }));
    await user.click(screen.getByRole("button", { name: "Add batch" }));
    expect(screen.getAllByLabelText(/^Vesting date/)).toHaveLength(2);

    const [firstBatch, secondBatch] = screen.getAllByRole("group");
    await user.click(firstBatch.querySelector("button")!);
    expect(screen.getAllByLabelText(/^Vesting date/)).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Batch 1" })).toBe(secondBatch);

    await user.type(screen.getByLabelText(/^Vesting date/), "2025-03-01");
    await user.type(screen.getByLabelText(/^Shares in batch/), "40");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0].employerGrantDetails.vestingTranches).toMatchObject([
        { vestDate: "2025-03-01", quantity: 40, grantPriceUSD: null },
      ]);
    });
  });

  it("warns when the batches add up to more than the holding's quantity", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Add holding" }));
    await user.selectOptions(
      screen.getByLabelText(/^Investment category/),
      "employerGrantedStock",
    );
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.click(screen.getByRole("button", { name: "Add batch" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Shares in batch/), "25");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The batches add up to 25 shares, more than the 10 in this holding",
    );
  });
});
