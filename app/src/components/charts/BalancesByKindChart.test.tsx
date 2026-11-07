import { render, screen } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import type { BalancePoint, SourceKind } from "../../domain";
import { BalancesByKindChart } from "./BalancesByKindChart";

// jsdom has no layout, so the real container draws nothing; give it a size.
vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 280 }),
  };
});

const kindLabels: Record<SourceKind, string> = {
  pensionFund: "Pension Fund",
  providentFund: "Provident Fund",
  managersInsurance: "Managers' Insurance",
  studyFund: "Study Fund",
  otherInvestments: "Other Investments",
};

const point = (age: number, byKind: Partial<Record<SourceKind, number>>): BalancePoint => {
  const full = { pensionFund: 0, providentFund: 0, managersInsurance: 0, studyFund: 0, otherInvestments: 0, ...byKind };
  return {
    age,
    netWorth: Object.values(full).reduce((sum, value) => sum + value, 0),
    byKind: full,
  };
};

const points = [
  point(60, { pensionFund: 500_000, otherInvestments: 200_000 }),
  point(70, { pensionFund: 400_000, otherInvestments: 50_000 }),
  point(80, { pensionFund: 100_000 }),
];

describe("BalancesByKindChart", () => {
  it("names the chart and lists a legend entry for each kind of savings", () => {
    const { container } = render(
      <BalancesByKindChart
        name="Savings by kind"
        description="What the savings are made of"
        points={points}
        kinds={["pensionFund", "otherInvestments"]}
        kindLabels={kindLabels}
        totalLabel="Total"
        currencySymbol="₪"
      />,
    );

    const svg = container.querySelector(".recharts-wrapper > svg.recharts-surface");
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).toHaveAttribute("aria-label", "Savings by kind");
    expect(screen.getByText("Pension Fund")).toBeInTheDocument();
    expect(screen.getByText("Other Investments")).toBeInTheDocument();
    expect(screen.queryByText("Study Fund")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".recharts-area")).toHaveLength(2);
  });

  it("marks the age the planned spending goes unfunded", () => {
    const { container } = render(
      <BalancesByKindChart
        name="Savings by kind"
        description="What the savings are made of"
        points={points}
        kinds={["pensionFund"]}
        kindLabels={kindLabels}
        totalLabel="Total"
        currencySymbol="₪"
        shortfallAge={80}
        shortfallLabel="Unfunded from here"
      />,
    );

    expect(container.querySelector(".recharts-reference-line")).not.toBeNull();
    expect(container.textContent).toContain("Unfunded from here");
  });

  it("draws no shortfall line when the spending stays covered", () => {
    const { container } = render(
      <BalancesByKindChart
        name="Savings by kind"
        description="What the savings are made of"
        points={points}
        kinds={["pensionFund"]}
        kindLabels={kindLabels}
        totalLabel="Total"
        currencySymbol="₪"
        shortfallAge={null}
      />,
    );

    expect(container.querySelector(".recharts-reference-line")).toBeNull();
  });
});
