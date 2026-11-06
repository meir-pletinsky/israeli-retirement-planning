import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCpiCache } from "../../cpi/client";
import { clearAllData, loadProfileFromDb } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { AssumptionsStep } from "./AssumptionsStep";

beforeEach(async () => {
  await clearAllData();
  resetCpiCache();
  // The advanced section looks up Israeli inflation; these tests do not need it.
  vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderStep() {
  renderWithProviders(<AssumptionsStep />, { route: "/my-data/assumptions" });
}

// The figures sit in right-to-left-safe isolates; compare the text without them.
const BIDI_MARKS = /[\u2066\u2069]/g;
const plain = (element: HTMLElement) => element.textContent!.replace(BIDI_MARKS, "");
const withoutMarks = (text: string) => (content: string) => content.replace(BIDI_MARKS, "").includes(text);

describe("Assumptions — preset row", () => {
  it("wraps onto further lines instead of running past a narrow screen", async () => {
    renderStep();

    const row = (await screen.findByRole("button", { name: "Optimistic" })).parentElement!;
    expect(row).toHaveClass("flex-wrap");
    expect(screen.getByRole("button", { name: "Optimistic" })).toHaveClass("max-w-full");
  });

  it("tells assistive technology which preset is chosen", async () => {
    const user = userEvent.setup();
    renderStep();

    expect(await screen.findByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Conservative" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Conservative" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "false");
    expect((await loadProfileFromDb())?.assumptions).toMatchObject({
      preset: "conservative",
      investmentReturnPct: 4,
      inflationPct: 4,
    });
  });
});

describe("Assumptions — what each preset means", () => {
  const describedBy = (button: HTMLElement) => plain(document.getElementById(button.getAttribute("aria-describedby")!)!);
  const returnField = () => screen.getByRole("spinbutton", { name: /^Investment return/ });

  it("shows each preset's return, inflation and the real return they leave", async () => {
    renderStep();

    const base = describedBy(await screen.findByRole("button", { name: "Base" }));
    expect(base).toContain("6% return per year");
    expect(base).toContain("2.5% inflation per year");
    expect(base).toContain("Real return about 3.4% per year (after inflation)");

    const conservative = describedBy(screen.getByRole("button", { name: "Conservative" }));
    expect(conservative).toContain("4% return per year");
    expect(conservative).toContain("Real return about 0% per year (after inflation)");

    const optimistic = describedBy(screen.getByRole("button", { name: "Optimistic" }));
    expect(optimistic).toContain("8% return per year");
    expect(optimistic).toContain("1.5% inflation per year");
    expect(optimistic).toContain("Real return about 6.4% per year (after inflation)");
  });

  it("says the rates are yearly and nominal, and that volatility is not part of a preset", async () => {
    renderStep();

    expect(await screen.findByText(/yearly, nominal rates/)).toBeInTheDocument();
    expect(screen.getByText(withoutMarks("(now 12% per year)"))).toHaveTextContent(
      /stays the same for every preset/,
    );
  });

  it("labels the fields with their yearly basis", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(await screen.findByRole("button", { name: "Advanced overrides" }));

    expect(returnField()).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /^Investment return per year \(before inflation\)/ })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /^Inflation per year/ })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /^Market volatility per year/ })).toBeInTheDocument();
  });

  it("stops marking Base once a value is changed by hand, and shows the custom values instead", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(await screen.findByRole("button", { name: "Advanced overrides" }));
    expect(screen.queryByRole("button", { name: "Custom" })).not.toBeInTheDocument();

    await user.clear(returnField());
    await user.type(returnField(), "9");

    const custom = await screen.findByRole("button", { name: "Custom" });
    expect(custom).toHaveAttribute("aria-pressed", "true");
    expect(describedBy(custom)).toContain("9% return per year");
    expect(describedBy(custom)).toContain("2.5% inflation per year");
    expect(screen.getByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "Base" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Custom" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "true");
    expect(returnField()).toHaveValue(6);
  });

  it("treats an inflation figure picked from the list as custom too", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(await screen.findByRole("button", { name: "Advanced overrides" }));

    await user.clear(screen.getByRole("spinbutton", { name: /^Inflation/ }));
    await user.type(screen.getByRole("spinbutton", { name: /^Inflation/ }), "3");

    expect(await screen.findByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps Base marked when only the volatility changes", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(await screen.findByRole("button", { name: "Advanced overrides" }));

    await user.clear(screen.getByRole("spinbutton", { name: /^Market volatility/ }));
    await user.type(screen.getByRole("spinbutton", { name: /^Market volatility/ }), "20");

    await waitFor(() => expect(screen.getByText(withoutMarks("(now 20% per year)"))).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Base" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Custom" })).not.toBeInTheDocument();
  });

  it("opens the fields when the custom card is pressed", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(await screen.findByRole("button", { name: "Advanced overrides" }));
    await user.clear(returnField());
    await user.type(returnField(), "9");
    await user.click(screen.getByRole("button", { name: "Advanced overrides" }));
    expect(screen.queryByRole("spinbutton", { name: /^Investment return/ })).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Custom" }));

    expect(returnField()).toHaveValue(9);
    expect(describedBy(screen.getByRole("button", { name: "Custom" }))).toContain("9% return per year");
  });
});
