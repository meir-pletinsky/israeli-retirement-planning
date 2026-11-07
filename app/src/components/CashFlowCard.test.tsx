import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cloneElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INCOME_BAND_KEYS, projectCashFlow, type CashFlowPlan, type IncomeBandKey } from "../domain";
import "../i18n";
import { buildTestProfile } from "../test/domainFixtures";
import { stubDownloads } from "../test/stubDownloads";
import { CashFlowCard } from "./CashFlowCard";

// jsdom has no layout, so the real container draws nothing; give it a size.
vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 280 }),
  };
});

const BIDI_MARKS = /[\u2066\u2069]/g;
const plain = (text: string | null | undefined) => (text ?? "").replace(BIDI_MARKS, "");

const labels = Object.fromEntries(INCOME_BAND_KEYS.map((band) => [band, `Source ${band}`])) as Record<
  IncomeBandKey,
  string
>;

// At 0% real return 120,000 pays 12,000 a year, so 1,000 a month runs out at age 77.
const retiring = {
  age: 66,
  retirementAge: 67,
  investmentReturnPct: 4,
  inflationPct: 4,
  pensionBalances: [120_000],
};

function planFor(monthlyExpenses: number): CashFlowPlan {
  const plan = projectCashFlow(buildTestProfile({ ...retiring, retirementMonthlyExpenses: monthlyExpenses }));
  if (!plan) throw new Error("expected a cash flow plan");
  return plan;
}

let downloads: ReturnType<typeof stubDownloads> | null = null;
afterEach(() => {
  downloads?.restore();
  downloads = null;
});

describe("CashFlowCard", () => {
  it("states the planned spending and where it stops being covered", () => {
    render(<CashFlowCard plan={planFor(1_000)} labels={labels} />);

    const card = screen.getByRole("region", { name: "Cash flow by year" });
    expect(card).toHaveAttribute("id", "cash-flow");
    expect(plain(card.textContent)).toContain("at your planned spending of ₪1,000 a month");
    expect(plain(card.textContent)).toMatch(/fully covered up to age 76/);
  });

  it("lists the planned line and the unfunded part in the legend only when something is unfunded", () => {
    // The line's own label sits inside the chart; the legend repeats it.
    const { unmount } = render(<CashFlowCard plan={planFor(1_000)} labels={labels} />);
    expect(screen.getAllByText("Planned spending").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Unfunded")).toBeInTheDocument();
    unmount();

    render(<CashFlowCard plan={planFor(100)} labels={labels} />);
    expect(screen.getAllByText("Planned spending").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Unfunded")).not.toBeInTheDocument();
    // The takeaway is shown once and repeated in the chart's description for screen readers.
    expect(
      screen.getAllByText((content) => /fully covered every year to age 90/.test(plain(content))).length,
    ).toBeGreaterThan(0);
  });

  it("shows the same figures as a table with the first unfunded year marked in words", async () => {
    const plan = planFor(1_000);
    render(<CashFlowCard plan={plan} labels={labels} />);

    await userEvent.click(screen.getByRole("button", { name: "Show as table" }));

    const table = screen.getByRole("table", { name: "Cash flow by year" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(plan.years.length);

    const marked = rows.filter((row) => row.getAttribute("data-first-unfunded") === "true");
    expect(marked).toHaveLength(1);
    expect(within(marked[0]).getByText(String(plan.firstUnfundedAge))).toBeInTheDocument();
    expect(within(marked[0]).getByText("Unfunded from here")).toBeInTheDocument();

    const header = within(table).getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(header).toEqual(expect.arrayContaining(["Age", "Year", "Tax (estimate)", "Unfunded"]));

    // A funded year has nothing in the unfunded column.
    const firstRow = rows[0];
    expect(within(firstRow).queryByText("Unfunded from here")).not.toBeInTheDocument();
    const cells = within(firstRow).getAllByRole("cell");
    expect(cells.at(-1)).toHaveTextContent("–");
  });

  it("offers the table as one CSV download", async () => {
    downloads = stubDownloads();
    const plan = planFor(1_000);
    render(<CashFlowCard plan={plan} labels={labels} />);

    await userEvent.click(screen.getByRole("button", { name: "Download as CSV" }));

    expect(downloads.count()).toBe(1);
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const text = await blob.text();
    const lines = text.replace("\uFEFF", "").trim().split("\r\n");
    expect(lines).toHaveLength(plan.years.length + 1);
    expect(lines[0].startsWith("Age,Year,")).toBe(true);
    expect(lines[0].endsWith(",Unfunded")).toBe(true);
    expect(lines[1].startsWith(`${plan.years[0].age},${plan.years[0].calendarYear},`)).toBe(true);
  });
});
