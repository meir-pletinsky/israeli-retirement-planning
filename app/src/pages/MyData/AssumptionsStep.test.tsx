import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { AssumptionsStep } from "./AssumptionsStep";

beforeEach(async () => {
  await clearAllData();
});

function renderStep() {
  renderWithProviders(<AssumptionsStep />, { route: "/my-data/assumptions" });
}

describe("Assumptions — preset row", () => {
  it("wraps onto further lines instead of running past a narrow screen", async () => {
    renderStep();

    const row = (await screen.findByRole("button", { name: "Optimistic" })).parentElement!;
    expect(row).toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "Optimistic" })).toHaveClass("max-w-full");
  });

  it("tells assistive technology which preset is chosen", async () => {
    const user = userEvent.setup();
    renderStep();

    expect(await screen.findByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Conservative" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "false");
    expect((await loadProfileFromDb())?.assumptions).toMatchObject({
      preset: "conservative",
      investmentReturnPct: 4,
      inflationPct: 4,
    });
  });
});
