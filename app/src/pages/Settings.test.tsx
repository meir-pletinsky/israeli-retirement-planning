import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadFxLookupEnabledFromDb, saveFxLookupEnabledToDb } from "../storage/db";
import { renderWithProviders } from "../test/renderWithProviders";
import { Settings } from "./Settings";

beforeEach(async () => {
  await clearAllData();
});

const lookupBox = () => screen.findByRole("checkbox", { name: "Look up exchange rates online" });

describe("Settings — exchange rates", () => {
  it("has the online lookup on by default, and says what is sent", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).toBeChecked();
    expect(screen.getByText(/Only the currency pair and a date are sent/)).toBeInTheDocument();
  });

  it("turns the lookup off and on, and remembers the choice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });

    await user.click(await lookupBox());
    expect(await lookupBox()).not.toBeChecked();
    await waitFor(async () => expect(await loadFxLookupEnabledFromDb()).toBe(false));

    await user.click(await lookupBox());
    await waitFor(async () => expect(await loadFxLookupEnabledFromDb()).toBe(true));
  });

  it("shows a lookup that was turned off earlier as off", async () => {
    await saveFxLookupEnabledToDb(false);
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).not.toBeChecked();
  });

  it("is turned back on when all data is cleared", async () => {
    await saveFxLookupEnabledToDb(false);
    await clearAllData();
    expect(await loadFxLookupEnabledFromDb()).toBe(true);
  });
});
