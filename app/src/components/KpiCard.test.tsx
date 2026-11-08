import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../i18n";
import { KpiCard } from "./KpiCard";

afterEach(() => vi.unstubAllGlobals());

describe("KpiCard visual anatomy", () => {
  it("keeps the label, tabular figure and explanation in reading order", () => {
    render(<KpiCard label="Monthly income" value="₪12,000" note="After tax" />);
    const label = screen.getByText("Monthly income");
    const value = screen.getByText("₪12,000");
    expect(value).toHaveClass("tabular-nums", "text-2xl", "sm:text-3xl");
    expect(label.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("After tax")).toHaveLength(1);
  });

  describe("KpiCard phone disclosure", () => {
    function setPhone(matches: boolean) {
      vi.stubGlobal("matchMedia", () => ({
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    }

    it("keeps desktop explanations visible without a disclosure", () => {
      setPhone(false);
      render(<KpiCard label="Income" value="₪12,000" note="After tax" />);
      expect(screen.getByText("After tax")).toBeVisible();
      expect(screen.queryByText("More details")).not.toBeInTheDocument();
    });

    it("starts phone notes closed and reveals one explanation and its link", async () => {
      setPhone(true);
      const user = userEvent.setup();
      render(
        <KpiCard label="Income" value="₪12,000" note={<><p>After tax</p><a href="/projections">Risk analysis</a></>} />,
      );
      const summary = screen.getByText("More details");
      const details = summary.closest("details")!;
      expect(details.open).toBe(false);
      expect(screen.getByText("After tax")).not.toBeVisible();
      expect(screen.getByRole("link", { name: "Risk analysis" })).not.toBeVisible();
      await user.click(summary);
      expect(details.open).toBe(true);
      expect(screen.getAllByText("After tax")).toHaveLength(1);
      expect(screen.getByText("After tax")).toBeVisible();
      expect(screen.getByRole("link", { name: "Risk analysis" })).toHaveAttribute("href", "/projections");
      await user.click(summary);
      expect(details.open).toBe(false);
    });

    it("does not render an empty phone disclosure when there is no note", () => {
      setPhone(true);
      render(<KpiCard label="Income" value="₪12,000" />);
      expect(screen.queryByText("More details")).not.toBeInTheDocument();
    });
  });

  it("uses contrast-safe status figures with a separate accent edge", () => {
    const { rerender } = render(<KpiCard label="Monthly shortfall" value="₪500" status="negative" />);
    expect(screen.getByText("₪500")).toHaveClass("text-amber-700");
    expect(screen.getByText("Monthly shortfall").parentElement).toHaveClass("before:bg-amber-500");
    rerender(<KpiCard label="Monthly surplus" value="₪500" status="positive" />);
    expect(screen.getByText("₪500")).toHaveClass("text-emerald-700");
  });
});
