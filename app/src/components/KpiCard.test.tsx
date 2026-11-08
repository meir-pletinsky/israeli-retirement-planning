import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "../i18n";
import { KpiCard } from "./KpiCard";

describe("KpiCard visual anatomy", () => {
  it("keeps the label, tabular figure and explanation in reading order", () => {
    render(<KpiCard label="Monthly income" value="₪12,000" note="After tax" />);
    const label = screen.getByText("Monthly income");
    const value = screen.getByText("₪12,000");
    expect(value).toHaveClass("tabular-nums", "text-2xl", "sm:text-3xl");
    expect(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("After tax")).toHaveLength(1);
  });

  it("uses contrast-safe status figures with a separate accent edge", () => {
    const { rerender } = render(<KpiCard label="Monthly shortfall" value="₪500" status="negative" />);
    expect(screen.getByText("₪500")).toHaveClass("text-amber-700");
    expect(screen.getByText("Monthly shortfall").parentElement).toHaveClass("before:bg-amber-500");
    rerender(<KpiCard label="Monthly surplus" value="₪500" status="positive" />);
    expect(screen.getByText("₪500")).toHaveClass("text-emerald-700");
  });
});
