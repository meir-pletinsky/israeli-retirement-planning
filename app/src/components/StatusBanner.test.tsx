import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import "../i18n";
import { StatusBanner } from "./StatusBanner";

describe("StatusBanner", () => {
  it("shows a green tick for on track", () => {
    const { container } = render(<StatusBanner status="onTrack" message="You're on track." />);

    expect(screen.getByText("You're on track.")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("bg-emerald-50");
  });

  it("styles a caution like a warning, not like a success", () => {
    const { container } = render(<StatusBanner status="caution" message="On track in average markets only." />);

    expect(screen.queryByText("✓")).not.toBeInTheDocument();
    expect(screen.getByText("!")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("bg-amber-50");
    expect(container.firstElementChild).not.toHaveClass("bg-emerald-50");
  });

  it("lists the details in order, then the action", () => {
    render(
      <MemoryRouter>
        <StatusBanner
          status="caution"
          message="Headline"
          details={["First detail", "Second detail"]}
          action={<a href="/projections">Go</a>}
        />
      </MemoryRouter>,
    );

    const lines = screen.getAllByText(/Headline|First detail|Second detail|Go/).map((line) => line.textContent);
    expect(lines).toEqual(["Headline", "First detail", "Second detail", "Go"]);
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("href", "/projections");
  });
});
