import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFxCache } from "../../fx/client";
import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { EquityStep } from "./EquityStep";

const RATES: Record<string, { date: string; rate: number }> = {
  "2024-03-01": { date: "2024-03-01", rate: 3.65 },
  "2024-02-29": { date: "2024-02-29", rate: 3.6 },
};

beforeEach(async () => {
  await clearAllData();
  resetFxCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const found = url.includes("frankfurter")
        ? RATES[new URL(url).searchParams.get("date") ?? ""]
        : undefined;
      return {
        ok: found !== undefined,
        json: async () => (found ? { ...found, base: "USD", quote: "ILS" } : { status: 404 }),
      } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;

const MORE_ESPP = /^More details: ESPP/;
const MORE_PERSONAL = /^More details: personal brokerage/;

async function openAddHolding(user: User, category: string) {
  await user.click(await screen.findByRole("button", { name: "Add holding" }));
  await user.selectOptions(screen.getByLabelText(/^Investment category/), category);
}

const lot = (n: number) => within(screen.getByRole("group", { name: `Purchase ${n}` }));

/** Text that holds the phrase, ignoring the marks that keep amounts left to right. */
const textWith = (phrase: string) => (content: string) =>
  content.replace(/[\u2066\u2069]/g, "").includes(phrase);

describe("EquityStep — purchase lots of an ESPP or private holding", () => {
  it("shows the cost basis and the gain counted for the lots", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.type(screen.getByLabelText(/^Current market price/), "200");
    await user.click(screen.getByRole("button", { name: MORE_ESPP }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));

    await user.type(lot(1).getByLabelText(/^Shares bought/), "10");
    await user.type(lot(1).getByLabelText(/^Market price that day/), "100");
    await user.type(lot(1).getByLabelText(/^Dollar rate on that date/), "5");

    // Worth ₪7,400 at ₪3.70; cost at ₪5.00 is ₪5,000, so the shekel gain is ₪2,400 and the lower one.
    expect(
      screen.getByText(
        textWith("The purchases cover 10 shares, with a cost basis of ₪5,000. Gain counted for tax: ₪2,400."),
      ),
    ).toBeInTheDocument();
  });

  it("fills each purchase's own dollar rate, and saves the lots with the holding", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.click(screen.getByRole("button", { name: MORE_PERSONAL }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));

    await user.type(lot(1).getByLabelText(/^Purchase date/), "2024-03-01");
    await user.type(lot(2).getByLabelText(/^Purchase date/), "2024-02-29");
    await waitFor(() => expect(lot(1).getByLabelText(/^Dollar rate on that date/)).toHaveValue(3.65));
    await waitFor(() => expect(lot(2).getByLabelText(/^Dollar rate on that date/)).toHaveValue(3.6));
    expect(lot(1).getByText(textWith("Bank of Israel rate of 2024-03-01"))).toBeInTheDocument();
    expect(lot(2).getByText(textWith("Bank of Israel rate of 2024-02-29"))).toBeInTheDocument();

    await user.type(lot(1).getByLabelText(/^Shares bought/), "6");
    await user.type(lot(1).getByLabelText(/^Price paid per share/), "100");
    await user.type(lot(2).getByLabelText(/^Shares bought/), "4");
    await user.type(lot(2).getByLabelText(/^Price paid per share/), "90");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => {
      const stored = await loadProfileFromDb();
      expect(stored?.equity.holdings[0].purchaseLots).toMatchObject([
        { purchaseDate: "2024-03-01", quantity: 6, priceUSD: 100, usdToIlsRate: 3.65 },
        { purchaseDate: "2024-02-29", quantity: 4, priceUSD: 90, usdToIlsRate: 3.6 },
      ]);
    });
  });

  it("keeps a rate the user typed when the date is entered", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    await user.click(screen.getByRole("button", { name: MORE_PERSONAL }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));

    await user.type(lot(1).getByLabelText(/^Dollar rate on that date/), "3.9");
    await user.type(lot(1).getByLabelText(/^Purchase date/), "2024-03-01");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(lot(1).getByLabelText(/^Dollar rate on that date/)).toHaveValue(3.9);
    expect(screen.queryByText(textWith("Bank of Israel rate of"))).not.toBeInTheDocument();
  });

  it("removes a purchase", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    await user.click(screen.getByRole("button", { name: MORE_PERSONAL }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));
    await user.type(lot(2).getByLabelText(/^Shares bought/), "7");

    await user.click(lot(1).getByRole("button", { name: "Remove" }));
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(lot(1).getByLabelText(/^Shares bought/)).toHaveValue(7);
  });

  it("warns when the purchases add up to more than the holding's quantity", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "10");
    await user.click(screen.getByRole("button", { name: MORE_PERSONAL }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));
    await user.type(lot(1).getByLabelText(/^Price paid per share/), "100");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.type(lot(1).getByLabelText(/^Shares bought/), "25");
    expect(screen.getByRole("status")).toHaveTextContent(
      "The purchases add up to 25 shares, more than the 10 in this holding",
    );
  });

  it("says which purchases are left out for lacking shares or a price", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "5");
    await user.click(screen.getByRole("button", { name: MORE_ESPP }));
    await user.click(screen.getByRole("button", { name: "Add purchase" }));

    expect(
      screen.getByText(textWith("lack shares or a price: 1.")),
    ).toBeInTheDocument();
    expect(screen.queryByText(textWith("The purchases cover"))).not.toBeInTheDocument();

    await user.type(lot(1).getByLabelText(/^Shares bought/), "5");
    await user.type(lot(1).getByLabelText(/^Market price that day/), "0");
    expect(screen.queryByText(textWith("lack shares or a price"))).not.toBeInTheDocument();
    expect(screen.getByText(textWith("The purchases cover 5 shares"))).toBeInTheDocument();
  });

  it("starts a purchase from the entry above, only while there are none", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    await user.type(screen.getByLabelText(/^Quantity \(shares\)/), "20");
    await user.type(screen.getByLabelText(/^Purchase date/), "2024-03-01");
    await user.type(screen.getByLabelText(/^Share price on purchase date/), "90");
    await waitFor(() => expect(screen.getByLabelText(/^Dollar rate on that date/)).toHaveValue(3.65));

    await user.click(screen.getByRole("button", { name: MORE_ESPP }));
    await user.click(screen.getByRole("button", { name: "Start from the purchase above" }));

    expect(lot(1).getByLabelText(/^Purchase date/)).toHaveValue("2024-03-01");
    expect(lot(1).getByLabelText(/^Shares bought/)).toHaveValue(20);
    expect(lot(1).getByLabelText(/^Market price that day/)).toHaveValue(90);
    expect(lot(1).getByLabelText(/^Dollar rate on that date/)).toHaveValue(3.65);
    expect(screen.queryByRole("button", { name: "Start from the purchase above" })).not.toBeInTheDocument();
  });

  it("does not offer to start from the entry before it has a price", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerEsppDiscount");
    await user.click(screen.getByRole("button", { name: MORE_ESPP }));
    expect(screen.queryByRole("button", { name: "Start from the purchase above" })).not.toBeInTheDocument();
  });

  it("says the unrealized gain is not used once a purchase is complete", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "personalBrokeragePurchase");
    await user.click(screen.getByRole("button", { name: MORE_PERSONAL }));
    const note = "Not used while purchases are listed below.";
    expect(screen.queryByText(note)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add purchase" }));
    await user.type(lot(1).getByLabelText(/^Shares bought/), "5");
    expect(screen.queryByText(note)).not.toBeInTheDocument();

    await user.type(lot(1).getByLabelText(/^Price paid per share/), "40");
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("is not offered for an employer grant", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await openAddHolding(user, "employerGrantedStock");
    await user.click(screen.getByRole("button", { name: /^More details: employer grant/ }));
    expect(screen.queryByRole("button", { name: "Add purchase" })).not.toBeInTheDocument();
  });

  it("opens the details of a saved holding that has purchases", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        equity: [
          {
            quantity: 10,
            priceUSD: 200,
            category: "employerEsppDiscount",
            purchaseLots: [{ date: "2024-03-01", quantity: 10, priceUSD: 100, usdToIlsRate: 5 }],
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EquityStep />, { route: "/my-data/equity" });

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(lot(1).getByLabelText(/^Purchase date/)).toHaveValue("2024-03-01");
    expect(lot(1).getByLabelText(/^Dollar rate on that date/)).toHaveValue(5);
  });
});
