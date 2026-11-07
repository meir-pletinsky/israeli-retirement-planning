import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { IncomeBandKey, TimelineSegment } from "../domain";
import "../i18n";
import { RetirementTimeline } from "./RetirementTimeline";

const labels: Record<IncomeBandKey, string> = {
  bituachLeumi: "Bituach Leumi",
  pensionFund: "Pension Fund",
  providentFund: "Provident Fund",
  managersInsurance: "Managers' Insurance",
  studyFund: "Study Fund",
  investments: "Other Investments",
};

const segment = (overrides: Partial<TimelineSegment>): TimelineSegment => ({
  fromAge: 67,
  toAge: 70,
  monthlyIncome: 5_000,
  bands: ["pensionFund"],
  amounts: { pensionFund: 5_000 },
  payments: {},
  withdrawals: { pensionFund: 5_000 },
  ...overrides,
});

const renderTimeline = (segments: TimelineSegment[], extra: Partial<Parameters<typeof RetirementTimeline>[0]> = {}) =>
  render(<RetirementTimeline segments={segments} labels={labels} currencySymbol="₪" {...extra} />);

describe("RetirementTimeline", () => {
  it("shows no unfunded line when every segment is funded", () => {
    renderTimeline([segment({})]);

    expect(screen.queryByText(/Unfunded/)).not.toBeInTheDocument();
  });

  it("shows the unfunded amount under the income of a segment that has one", () => {
    renderTimeline([segment({}), segment({ fromAge: 71, toAge: 75, monthlyIncome: 3_000, unfunded: 2_000 })]);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).queryByText(/Unfunded/)).not.toBeInTheDocument();
    expect(within(rows[1]).getByText(/Unfunded\s*₪2,000/)).toBeInTheDocument();
  });

  it("says nothing pays when the savings are used up and nothing recurs", () => {
    renderTimeline([
      segment({ fromAge: 80, toAge: 90, monthlyIncome: 0, bands: [], amounts: {}, withdrawals: {}, unfunded: 4_000 }),
    ]);

    expect(screen.getByText(/Nothing pays/)).toBeInTheDocument();
  });

  it("renders the controls and the basis note between the intro and the table", () => {
    renderTimeline([segment({})], {
      controls: <div role="group" aria-label="Basis" />,
      basisNote: <p>Basis note</p>,
    });

    const region = screen.getByRole("region", { name: "Retirement timeline" });
    expect(within(region).getByRole("group", { name: "Basis" })).toBeInTheDocument();
    expect(within(region).getByText("Basis note")).toBeInTheDocument();
  });
});
