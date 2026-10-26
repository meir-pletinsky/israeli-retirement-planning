import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb } from "../../storage/db";
import { renderWithProviders } from "../../test/renderWithProviders";
import { PersonalStep } from "./PersonalStep";

beforeEach(async () => {
  await clearAllData();
});

describe("PersonalStep — monthly gross salary", () => {
  it("persists the salary used for contribution modeling", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const salary = await screen.findByLabelText(/Monthly gross salary/);
    await user.type(salary, "20000");

    await waitFor(async () => {
      expect((await loadProfileFromDb())?.personal.monthlyGrossSalary).toBe(20000);
    });
  });

  it("stores null when the salary field is cleared", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const salary = await screen.findByLabelText(/Monthly gross salary/);
    await user.type(salary, "15000");
    await user.clear(salary);

    await waitFor(async () => {
      expect((await loadProfileFromDb())?.personal.monthlyGrossSalary).toBeNull();
    });
  });
});

describe("PersonalStep — Bituach Leumi", () => {
  async function openSection(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });
    await user.click(await screen.findByRole("button", { name: /Bituach Leumi old-age pension/ }));
  }

  it("includes the state pension by default", async () => {
    const user = userEvent.setup();
    await openSection(user);

    expect(screen.getByRole("checkbox", { name: /Include the state pension/ })).toBeChecked();
  });

  it("persists the include toggle", async () => {
    const user = userEvent.setup();
    await openSection(user);

    await user.click(screen.getByRole("checkbox", { name: /Include the state pension/ }));

    await waitFor(async () => {
      expect((await loadProfileFromDb())?.bituachLeumi.includeInProjection).toBe(false);
    });
  });

  it("persists insured years and a manual pension amount", async () => {
    const user = userEvent.setup();
    await openSection(user);

    await user.type(screen.getByLabelText(/Insured years to date/), "12");
    await user.type(screen.getByLabelText(/Monthly pension from Bituach Leumi's calculator/), "2500");

    await waitFor(async () => {
      const saved = (await loadProfileFromDb())?.bituachLeumi;
      expect(saved?.insuredYearsToDate).toBe(12);
      expect(saved?.monthlyPensionOverride).toBe(2500);
    });
  });
});
