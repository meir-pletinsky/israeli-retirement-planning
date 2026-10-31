import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CPI_BUILT_IN_SUMMARY } from "../../cpi/builtIn";
import { resetCpiCache } from "../../cpi/client";
import type { CpiPoint } from "../../cpi/format";
import { clearAllData, loadProfileFromDb, saveCpiLookupEnabledToDb } from "../../storage/db";
import { cbsAnswer, steadyMonths } from "../../test/cpiFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { AssumptionsStep } from "./AssumptionsStep";

// 0.7% in May 2026, 1% in each of the nine Mays before it, 4% before that.
// So the figures are 0.7, then averages of 1.0 (10 years), 2.5 (20 years) and 3.0 (30 years).
const LIVE_POINTS: CpiPoint[] = [
  ...steadyMonths({ year: 1990, month: 1 }, { year: 2016, month: 5 }, 4),
  ...steadyMonths({ year: 2016, month: 6 }, { year: 2026, month: 4 }, 1),
  { year: 2026, month: 5, yearOverYearPct: 0.7 },
];

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await clearAllData();
  resetCpiCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(cbsAnswer(LIVE_POINTS)) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openAdvanced(user: ReturnType<typeof userEvent.setup>) {
  renderWithProviders(<AssumptionsStep />, { route: "/my-data/assumptions" });
  await user.click(await screen.findByRole("button", { name: "Advanced overrides" }));
}

const reference = () => screen.getByRole("heading", { name: /Israeli inflation/ }).parentElement!.parentElement!;
const rowsOf = () => within(reference()).getAllByRole("listitem");
const inflationField = () => screen.getByRole("spinbutton", { name: /^Inflation/ });
const asPercent = (pct: number) => `${(Math.round(pct * 10) / 10).toFixed(1)}%`;

function expectRow(row: HTMLElement, label: string, value: string) {
  expect(within(row).getByText(label)).toBeInTheDocument();
  expect(within(row).getByText(value)).toBeInTheDocument();
}

describe("Assumptions — Israeli inflation for reference", () => {
  it("asks for nothing until the advanced settings are opened", async () => {
    renderWithProviders(<AssumptionsStep />, { route: "/my-data/assumptions" });
    await screen.findByRole("button", { name: "Advanced overrides" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: /Israeli inflation/ })).not.toBeInTheDocument();
  });

  it("shows the live latest figure and the 10, 20 and 30 year averages, and where they come from", async () => {
    const user = userEvent.setup();
    await openAdvanced(user);

    expect(await screen.findByText("Live figures up to May 2026.")).toHaveAttribute("role", "status");
    const rows = rowsOf();
    expect(rows).toHaveLength(4);
    expectRow(rows[0], "12 months to May 2026", "0.7%");
    expectRow(rows[1], "10-year average", "1.0%");
    expectRow(rows[2], "20-year average", "2.5%");
    expectRow(rows[3], "30-year average", "3.0%");
    expect(screen.getByText("For reference. Your plan uses the value above.")).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/api\.cbs\.gov\.il\/index\/data\/price\?id=120010/);
  });

  it("shows the built-in figures, and says so, when the Bureau cannot be reached", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const user = userEvent.setup();
    await openAdvanced(user);

    expect(
      await screen.findByText(
        "Could not reach the Bureau of Statistics. Showing built-in figures up to December 2025.",
      ),
    ).toBeInTheDocument();
    const rows = rowsOf();
    expect(rows).toHaveLength(4);
    expectRow(rows[0], "12 months to December 2025", asPercent(CPI_BUILT_IN_SUMMARY.latest.yearOverYearPct));
    CPI_BUILT_IN_SUMMARY.averages.forEach(({ years, pct }, index) => {
      expectRow(rows[index + 1], `${years}-year average`, asPercent(pct));
    });
  });

  it("shows the built-in figures while the answer is on its way", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    await openAdvanced(user);

    expect(await screen.findByText("Loading the latest figures…")).toBeInTheDocument();
    expect(rowsOf()).toHaveLength(4);
  });

  it("shows the built-in figures and asks for nothing when the lookup is turned off in Settings", async () => {
    await saveCpiLookupEnabledToDb(false);
    const user = userEvent.setup();
    await openAdvanced(user);

    expect(
      await screen.findByText("Online lookup is turned off in Settings. Showing built-in figures up to December 2025."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("puts a figure into the inflation field and saves it, leaving the preset alone", async () => {
    const user = userEvent.setup();
    await openAdvanced(user);
    expect(inflationField()).toHaveValue(2.5);

    await user.click(await screen.findByRole("button", { name: "Use 3.0% as inflation (30-year average)" }));

    expect(inflationField()).toHaveValue(3);
    await waitFor(async () => {
      expect((await loadProfileFromDb())?.assumptions).toMatchObject({ inflationPct: 3, preset: "base" });
    });
  });

  it("uses the figure rounded to one decimal, the way it is shown", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    const user = userEvent.setup();
    await openAdvanced(user);

    await user.click(
      await screen.findByRole("button", { name: "Use 2.6% as inflation (12 months to December 2025)" }),
    );
    expect(inflationField()).toHaveValue(2.6);
  });

  it("marks the figure that is already in use instead of offering it", async () => {
    const user = userEvent.setup();
    await openAdvanced(user);
    await screen.findByText("Live figures up to May 2026.");

    const twentyYear = rowsOf()[2];
    expect(twentyYear).toHaveTextContent("In use");
    expect(within(twentyYear).queryByRole("button")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use 3.0% as inflation (30-year average)" }));
    expect(rowsOf()[3]).toHaveTextContent("In use");
    expect(screen.getByRole("button", { name: "Use 2.5% as inflation (20-year average)" })).toBeInTheDocument();
  });
});
