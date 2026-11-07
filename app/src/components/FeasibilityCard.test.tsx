import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { ConfidentRetirementAge, RetirementFeasibility } from "../domain";
import "../i18n";
import { FeasibilityCard } from "./FeasibilityCard";

const feasible: RetirementFeasibility = { status: "feasible", earliestAge: 58, yearsFromNow: 8 };

function renderCard(confidentAge?: ConfidentRetirementAge | null, feasibility = feasible) {
  render(
    <MemoryRouter>
      <FeasibilityCard feasibility={feasibility} maxSearchAge={70} confidentAge={confidentAge} />
    </MemoryRouter>,
  );
}

describe("FeasibilityCard", () => {
  it("says the earliest age is for average markets", () => {
    renderCard(null);

    expect(screen.getByText("Age 58")).toBeInTheDocument();
    expect(screen.getByText("In average markets, where your assumed return is earned every year.")).toBeInTheDocument();
    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();
  });

  it("adds the later age that holds with 90% confidence", () => {
    renderCard({ status: "found", age: 63 });

    expect(screen.getByText("Age 58")).toBeInTheDocument();
    expect(screen.getByText("With 90% confidence: age 63")).toBeInTheDocument();
  });

  it("says when the same age holds with 90% confidence", () => {
    renderCard({ status: "found", age: 58 });

    expect(screen.getByText("The same age holds with 90% confidence.")).toBeInTheDocument();
  });

  it("says when no age up to the search limit holds with 90% confidence", () => {
    renderCard({ status: "none", age: null });

    expect(screen.getByText("With 90% confidence: not reachable by age 70.")).toBeInTheDocument();
  });

  it("does not show a confident age when the plan is not feasible", () => {
    renderCard({ status: "found", age: 63 }, { status: "notFeasible", earliestAge: null, yearsFromNow: null });

    expect(screen.queryByText(/confidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/average markets/)).not.toBeInTheDocument();
  });
});
