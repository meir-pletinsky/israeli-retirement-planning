import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { PensionSavingsStep } from "./PensionSavingsStep";

beforeEach(async () => {
  await clearAllData();
});

describe("PensionSavingsStep — accounts repeater", () => {
  it("supports adding, editing, and removing a pension account", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PensionSavingsStep />, {
      route: "/my-data/pension-savings",
    });

    // Initially empty.
    expect(
      await screen.findByText(/no accounts added yet/i),
    ).toBeInTheDocument();

    // Add an account.
    await user.click(screen.getByRole("button", { name: "Add account" }));
    await user.type(screen.getByLabelText("Provider name"), "Menora Mivtachim");
    // NumberField's label wraps a currency-suffix span alongside the input,
    // so its computed label text is "Total accumulated balance₪" — match by
    // substring rather than exact string.
    await user.type(
      screen.getByLabelText(/Total accumulated balance/),
      "150000",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Menora Mivtachim")).toBeInTheDocument();
    expect(screen.getByText("\u20aa150,000")).toBeInTheDocument();
    expect(screen.queryByText(/no accounts added yet/i)).not.toBeInTheDocument();

    // Edit it.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const balanceInput = screen.getByLabelText(/Total accumulated balance/);
    await user.clear(balanceInput);
    await user.type(balanceInput, "175000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("\u20aa175,000")).toBeInTheDocument();

    // Remove it (through the confirm modal).
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(screen.queryByText("Menora Mivtachim")).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/no accounts added yet/i)).toBeInTheDocument();
  });
});
