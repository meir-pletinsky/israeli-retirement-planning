import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import "../../i18n";
import { PersonTabs, type PersonTab } from "./PersonTabs";
import { parsePerson, useActivePerson } from "./activePerson";

// These pieces need only the router and translations, not the stored profile.
function renderInRouter(ui: ReactElement, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

const TABS: PersonTab[] = [
  { person: "self", detail: "\u20aa100" },
  { person: "spouse", detail: "No accounts", hasError: true },
];

function renderTabs(active: "self" | "spouse" = "self") {
  const onChange = vi.fn();
  renderInRouter(
    <PersonTabs id="test" tabs={TABS} active={active} onChange={onChange}>
      <p>panel content</p>
    </PersonTabs>,
  );
  return onChange;
}

describe("PersonTabs", () => {
  it("shows the active person's panel under an accessible tab list", () => {
    renderTabs("spouse");

    expect(screen.getByRole("tablist", { name: "Choose whose data to view" })).toBeInTheDocument();
    const partner = screen.getByRole("tab", { name: /^Partner/ });
    expect(partner).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^Me/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(/^Partner/);
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("shows each tab's detail and flags a tab that needs attention in words", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: /^Me/ })).toHaveTextContent("\u20aa100");
    expect(screen.getByRole("tab", { name: /^Me/ })).not.toHaveTextContent("Needs attention");
    expect(screen.getByRole("tab", { name: /^Partner/ })).toHaveTextContent("Needs attention");
  });

  it("changes person on click", async () => {
    const user = userEvent.setup();
    const onChange = renderTabs();

    await user.click(screen.getByRole("tab", { name: /^Partner/ }));

    expect(onChange).toHaveBeenCalledWith("spouse");
  });

  it("moves between tabs with the arrow, Home and End keys and wraps around", async () => {
    const user = userEvent.setup();
    const onChange = renderTabs();

    screen.getByRole("tab", { name: /^Me/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("spouse");
    // Focus followed the change, so Left wraps back from the partner to the user.
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("self");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("spouse");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("self");
  });

  it("puts only the active tab in the tab order", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: /^Me/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /^Partner/ })).toHaveAttribute("tabindex", "-1");
  });
});

describe("parsePerson", () => {
  it("accepts only the two known people", () => {
    expect(parsePerson("self")).toBe("self");
    expect(parsePerson("spouse")).toBe("spouse");
    expect(parsePerson("partner")).toBeNull();
    expect(parsePerson(null)).toBeNull();
  });
});

describe("useActivePerson", () => {
  function Probe() {
    const { person, setPerson } = useActivePerson();
    const { search } = useLocation();
    return (
      <button type="button" onClick={() => setPerson("spouse")}>
        {person} {search}
      </button>
    );
  }

  function renderProbe(route: string) {
    return renderInRouter(
      <Routes>
        <Route path="/step" element={<Probe />} />
      </Routes>,
      route,
    );
  }

  it("starts on the user", () => {
    renderProbe("/step");
    expect(screen.getByRole("button")).toHaveTextContent(/^self/);
  });

  it("starts on the person named in the page address", () => {
    renderProbe("/step?person=spouse");
    expect(screen.getByRole("button")).toHaveTextContent(/^spouse/);
  });

  it("ignores an unknown person in the page address", () => {
    renderProbe("/step?person=nobody");
    expect(screen.getByRole("button")).toHaveTextContent(/^self/);
  });

  it("keeps its own selection when used outside the My Data layout", async () => {
    const user = userEvent.setup();
    renderProbe("/step");

    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent(/^spouse/);
  });
});
