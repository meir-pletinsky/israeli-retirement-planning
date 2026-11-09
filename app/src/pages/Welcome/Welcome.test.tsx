import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../app/App";
import { clearAllData } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";

beforeEach(async () => {
  await clearAllData();
});

async function renderWelcome() {
  renderWithProviders(<App />);
  await screen.findByText("Your retirement plan, on your device");
}

describe("Welcome page — new visitor", () => {
  it("explains what the app does, and that a plan can be exported and imported", async () => {
    await renderWelcome();

    const about = screen.getByRole("region", { name: "What this app does" });
    expect(within(about).getByText("The earliest age you could retire")).toBeInTheDocument();
    expect(within(about).getByText("Save and come back later")).toBeInTheDocument();
    expect(about).toHaveTextContent("Export data");
    expect(about).toHaveTextContent("Import data");
  });

  it("has a privacy box that says nothing leaves the device", async () => {
    await renderWelcome();

    const privacy = screen.getByRole("region", { name: "Private by design" });
    expect(privacy).toHaveTextContent("Your financial data never leaves this device.");
    expect(privacy).toHaveTextContent("No account and no server.");
    expect(privacy).toHaveTextContent("Nothing is uploaded.");
  });

  it("shows the suggested steps in order, ending at the results", async () => {
    await renderWelcome();

    const flow = screen.getByRole("region", { name: "Get started" });
    const steps = within(flow)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(steps).toEqual([
      "Personal",
      "Pension & Savings",
      "Investments & Deposits",
      "Expenses",
      "Assumptions",
      "See your results",
    ]);
    expect(within(flow).getAllByText("Fast track fills most of this")).toHaveLength(2);
    expect(within(flow).getAllByText("Optional")).toHaveLength(2);
  });

  it("names where deposits live and what the expenses step asks", async () => {
    await renderWelcome();

    const flow = screen.getByRole("region", { name: "Get started" });
    expect(flow).toHaveTextContent(/bank deposits/);
    expect(flow).toHaveTextContent("What you expect to spend in retirement.");
    expect(flow).not.toHaveTextContent("What you spend now");
  });

  it("makes every step card a link to its My Data step", async () => {
    await renderWelcome();

    const flow = screen.getByRole("region", { name: "Get started" });
    const hrefs = [
      ["Personal", "/my-data/personal"],
      ["Pension & Savings", "/my-data/pension-savings"],
      ["Investments & Deposits", "/my-data/equity"],
      ["Expenses", "/my-data/expenses"],
      ["Assumptions", "/my-data/assumptions"],
    ];
    for (const [name, href] of hrefs) {
      expect(within(flow).getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("opens the chosen step from its card", async () => {
    const user = userEvent.setup();
    await renderWelcome();

    const flow = screen.getByRole("region", { name: "Get started" });
    await user.click(within(flow).getByRole("link", { name: "Expenses" }));

    expect(await screen.findByRole("button", { name: /^Expenses/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("recommends the Clearing House import and lists what it fills in", async () => {
    await renderWelcome();

    const fastTrack = screen.getByRole("region", {
      name: "Fastest start: import your Pension Clearing House report",
    });
    expect(within(fastTrack).getByText("Recommended fast track")).toBeInTheDocument();
    expect(within(fastTrack).getByText("Your age")).toBeInTheDocument();
    expect(
      within(fastTrack).getByText("Estimated monthly pension and conversion factor"),
    ).toBeInTheDocument();
    expect(fastTrack).toHaveTextContent(
      "desired retirement age, expenses, stock holdings, bank deposits, other assets and assumptions",
    );
    expect(
      within(fastTrack).getByRole("link", { name: "Import Clearing House report" }),
    ).toHaveAttribute("href", "/import/clearing-house");
  });

  it("opens the Clearing House import from the fast track", async () => {
    const user = userEvent.setup();
    await renderWelcome();

    await user.click(screen.getByRole("link", { name: "Import Clearing House report" }));

    expect(
      await screen.findByRole("heading", { name: "Import from the Pension Clearing House" }),
    ).toBeInTheDocument();
  });

  it("links to the demo video, which opens inside the app", async () => {
    const user = userEvent.setup();
    await renderWelcome();

    const link = screen.getByRole("link", { name: "Watch the demo video" });
    expect(link).toHaveAttribute("href", "/demo");
    await user.click(link);

    expect(await screen.findByRole("heading", { level: 1, name: "Demo" })).toBeInTheDocument();
  });

  it("scrolls to the Get started section from the top button", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await renderWelcome();

    await user.click(screen.getByRole("button", { name: "Get started" }));

    const flow = screen.getByRole("region", { name: "Get started" });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(flow);
    expect(within(flow).getByRole("heading", { name: "Get started" })).toHaveFocus();
  });

  it("starts the My Data steps from the button inside the Get started section", async () => {
    const user = userEvent.setup();
    await renderWelcome();

    const flow = screen.getByRole("region", { name: "Get started" });
    expect(screen.getAllByRole("button", { name: "Start my plan" })).toHaveLength(1);
    await user.click(within(flow).getByRole("button", { name: "Start my plan" }));

    expect(await screen.findByLabelText(/Monthly gross salary/)).toBeInTheDocument();
  });
});

describe("Welcome page — loading a saved file", () => {
  it("says that the button loads a file saved from earlier use", async () => {
    await renderWelcome();

    expect(screen.getByRole("button", { name: "Load my saved data file" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import data" })).not.toBeInTheDocument();
    expect(screen.getByText(/Choose the \.json file you saved earlier/)).toBeInTheDocument();
  });

  it("loads a saved file and opens the dashboard", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<App />);
    await screen.findByText("Your retirement plan, on your device");
    const saved = JSON.stringify(
      buildTestProfile({ age: 45, retirementAge: 67, pensionBalances: [250000] }),
    );

    await user.upload(
      container.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File([saved], "israeli-retirement-planning-2026-01-01.json", { type: "application/json" }),
    );

    expect(await screen.findByText("Sustainable income after tax")).toBeInTheDocument();
  });

  it("shows an error for a file that is not a saved plan", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<App />);
    await screen.findByText("Your retirement plan, on your device");

    await user.upload(
      container.querySelector<HTMLInputElement>('input[type="file"]')!,
      new File(["not json"], "notes.json", { type: "application/json" }),
    );

    expect(await screen.findByText(/Couldn't import this file/)).toBeInTheDocument();
    expect(screen.getByText("Your retirement plan, on your device")).toBeInTheDocument();
  });
});
