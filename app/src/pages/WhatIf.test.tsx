import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ProjectionsHeader } from "../components/ProjectionsHeader";
import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { WhatIf } from "./WhatIf";

async function renderAt(route: string) {
  await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 60, pensionBalances: [800_000] }));
  await saveOnboardedToDb(true);
  renderWithProviders(
    <Routes>
      <Route
        path="/projections"
        element={
          <>
            <ProjectionsHeader />
            <p>Plan page</p>
          </>
        }
      />
      <Route path="/projections/what-if" element={<WhatIf />} />
    </Routes>,
    { route },
  );
}

describe("WhatIf page", () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it("shows the what-if sliders under the Projections heading, with its tab marked as current", async () => {
    await renderAt("/projections/what-if");

    expect(await screen.findByLabelText("You stop working at age")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Projections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "What if?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /What if\?/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /My plan/ })).not.toHaveAttribute("aria-current");
  });

  it("switches between the plan's projections and the what-if page from the tabs", async () => {
    const user = userEvent.setup();
    await renderAt("/projections/what-if");
    await screen.findByLabelText("You stop working at age");

    await user.click(screen.getByRole("button", { name: /My plan/ }));
    expect(await screen.findByText("Plan page")).toBeInTheDocument();
    expect(screen.queryByLabelText("You stop working at age")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /My plan/ })).toHaveAttribute("aria-current", "step");

    await user.click(screen.getByRole("button", { name: /What if\?/ }));
    expect(await screen.findByLabelText("You stop working at age")).toBeInTheDocument();
  });
});
