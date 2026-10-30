import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFxCache } from "../fx/client";
import { clearAllData, loadFxLookupEnabledFromDb, saveFxLookupEnabledToDb } from "../storage/db";
import { renderWithProviders } from "../test/renderWithProviders";
import { Settings } from "./Settings";

const TODAY = { date: "2026-10-30", base: "USD", quote: "ILS", rate: 3.118 };

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await clearAllData();
  resetFxCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(TODAY) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lookupBox = () => screen.findByRole("checkbox", { name: "Look up exchange rates online" });

describe("Settings — exchange rates", () => {
  it("has the online lookup on by default, and says what is sent", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).toBeChecked();
    expect(screen.getByText(/Only the currency pair and a date are sent/)).toBeInTheDocument();
  });

  it("shows the current rate with its day, and says it is checked every hour", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    const status = await screen.findByText(/Current rate: ₪3[.,]118 per US dollar \(Bank of Israel, 2026-10-30\)/);
    expect(status).toHaveTextContent("Checked every hour while the app is open.");
    expect(status).toHaveAttribute("role", "status");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.frankfurter.dev/v2/rate/usd/ils?providers=boi");
  });

  it("says so when the current rate cannot be loaded", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText("The current rate could not be loaded. It will be tried again within the hour.")).toBeInTheDocument();
    expect(screen.queryByText(/Current rate:/)).not.toBeInTheDocument();
  });

  it("shows no rate and asks for none while the lookup is turned off", async () => {
    await saveFxLookupEnabledToDb(false);
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).not.toBeChecked();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns the lookup off and on, and remembers the choice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByText(/Current rate:/);

    await user.click(await lookupBox());
    expect(await lookupBox()).not.toBeChecked();
    expect(screen.queryByText(/Current rate:/)).not.toBeInTheDocument();
    await waitFor(async () => expect(await loadFxLookupEnabledFromDb()).toBe(false));

    await user.click(await lookupBox());
    await waitFor(async () => expect(await loadFxLookupEnabledFromDb()).toBe(true));
    expect(await screen.findByText(/Current rate:/)).toBeInTheDocument();
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

describe("Settings — privacy", () => {
  it("explains what stays on the device and the two things that are requested", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    const heading = await screen.findByRole("heading", { name: "Privacy" });
    const section = heading.closest("section") as HTMLElement;
    expect(section).toHaveTextContent("saved in this browser only");
    expect(section).toHaveTextContent("Exchange rates:");
    expect(section).toHaveTextContent("Stock prices:");
    expect(section).toHaveTextContent("The app never uploads them.");
  });
});
