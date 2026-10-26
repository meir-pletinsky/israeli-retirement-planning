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
