import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { MyDataLayout } from "./MyDataLayout";

beforeEach(async () => {
  await clearAllData();
});

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/my-data" element={<MyDataLayout />}>
        <Route path="personal" element={<p>personal step</p>} />
        <Route path="pension-savings" element={<p>pension step</p>} />
        <Route path="equity" element={<p>equity step</p>} />
        <Route path="expenses" element={<p>expenses step</p>} />
        <Route path="assumptions" element={<p>assumptions step</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

const step = (name: RegExp) => screen.getByRole("button", { name });

describe("MyDataLayout — stepper reports what is entered, not where the user is", () => {
  it("shows no check marks for steps that were jumped over with nothing entered", async () => {
    renderAt("/my-data/assumptions");
    await screen.findByText("assumptions step");

    for (const name of [/^Pension & Savings/, /^Investments & Deposits/, /^Expenses/]) {
      expect(step(name)).toHaveTextContent("Nothing entered yet");
      expect(step(name).querySelector("svg")).toBeNull();
    }
    expect(step(/^Personal/)).toHaveTextContent("Required details missing");
    expect(step(/^Personal/).querySelector("svg")).toBeNull();
    expect(step(/^Assumptions/)).toHaveTextContent("Using defaults");
    expect(step(/^Assumptions/)).toHaveAttribute("aria-current", "step");
  });

  it("checks a step once it holds data, even when it is not the one before the current step", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 45, retirementAge: 62, retirementMonthlyExpenses: 15000 }),
    );
    renderAt("/my-data/personal");
    await screen.findByText("personal step");

    expect(step(/^Personal/)).toHaveTextContent("Required details complete");
    expect(step(/^Personal/).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(step(/^Expenses/)).toHaveTextContent("Details entered");
    expect(step(/^Expenses/).querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(step(/^Pension & Savings/)).toHaveTextContent("Nothing entered yet");
    expect(step(/^Pension & Savings/).querySelector("svg")).toBeNull();
  });

  it("reads the status out with the step name", async () => {
    renderAt("/my-data/personal");
    await screen.findByText("personal step");

    expect(step(/^Pension & Savings/)).toHaveAccessibleName("Pension & Savings Nothing entered yet");
  });

  it("still navigates when a step is clicked", async () => {
    const user = userEvent.setup();
    renderAt("/my-data/personal");
    await screen.findByText("personal step");

    await user.click(within(document.body).getByRole("button", { name: /^Expenses/ }));
    expect(await screen.findByText("expenses step")).toBeInTheDocument();
  });
});
