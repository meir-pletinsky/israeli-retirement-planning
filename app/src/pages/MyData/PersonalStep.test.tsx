import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../../storage/db";
import { buildTestProfile } from "../../test/domainFixtures";
import { renderWithProviders } from "../../test/renderWithProviders";
import { PersonalStep } from "./PersonalStep";

beforeEach(async () => {
  await clearAllData();
});

describe("PersonalStep — spouse", () => {
  const married = { age: 50, retirementAge: 65, maritalStatus: "married" as const };

  it("shows the spouse section only for a married user", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await screen.findByLabelText(/Monthly gross salary/);
    expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Marital status"), "married");

    expect(screen.getByLabelText(/^Spouse's age/)).toBeInTheDocument();
    // Everything else waits for the spouse's age.
    expect(screen.queryByLabelText(/^Spouse's retirement age/)).not.toBeInTheDocument();
  });

  it("saves the spouse's details once their age is entered", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile(married));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await user.type(await screen.findByLabelText(/^Spouse's age/), "48");
    await user.selectOptions(screen.getByLabelText(/^Spouse's gender/), "female");
    await user.type(screen.getByLabelText(/^Spouse's retirement age/), "62");
    await user.type(screen.getByLabelText(/Spouse's monthly gross salary/), "12000");
    await user.click(screen.getByRole("button", { name: /Spouse's Bituach Leumi pension/ }));
    await user.click(screen.getByRole("checkbox", { name: /Include their state pension/ }));
    await user.type(screen.getByLabelText(/Spouse's insured years to date/), "20");

    await waitFor(async () => {
      const { spouse } = (await loadProfileFromDb())!;
      expect(spouse).toMatchObject({
        age: 48,
        gender: "female",
        retirementAge: 62,
        monthlyGrossSalary: 12000,
      });
      expect(spouse.bituachLeumi).toMatchObject({
        includeInProjection: true,
        insuredYearsToDate: 20,
      });
    });
  });

  it("requires the spouse's retirement age once their age is entered", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile({ ...married, spouse: { age: 48 } }));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await screen.findByLabelText(/^Spouse's retirement age/);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
  });

  it("rejects a spouse retirement age below their current age but accepts an equal one", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({ ...married, spouse: { age: 48, retirementAge: 45 } }),
    );
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(
      await screen.findByText(/spouse's retirement age can't be lower than their current age/i),
    ).toBeInTheDocument();

    // A spouse who has already retired enters their current age.
    const retirementAge = screen.getByLabelText(/^Spouse's retirement age/);
    await user.clear(retirementAge);
    await user.type(retirementAge, "48");

    expect(
      screen.queryByText(/spouse's retirement age can't be lower than their current age/i),
    ).not.toBeInTheDocument();
  });

  it("does not ask for a spouse once the user is no longer married", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile({ ...married, spouse: { age: 48 } }));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await user.selectOptions(await screen.findByLabelText("Marital status"), "divorced");

    expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();
    // The details are kept, so switching back does not lose them.
    await user.selectOptions(screen.getByLabelText("Marital status"), "married");
    expect(screen.getByLabelText(/^Spouse's age/)).toHaveValue(48);
  });
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

describe("PersonalStep — tax credit points", () => {
  it("explains the default and persists a typed value", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const points = await screen.findByLabelText(/^Tax credit points/);
    expect(points).toHaveValue(null);
    expect(screen.getByText(/Leave empty to use the default: 2\.25 for a man, 2\.75 for a woman/)).toBeInTheDocument();

    await user.type(points, "2.75");

    await waitFor(async () => {
      expect((await loadProfileFromDb())?.personal.creditPoints).toBe(2.75);
    });
  });

  it("accepts quarter points", async () => {
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    expect(await screen.findByLabelText(/^Tax credit points/)).toHaveAttribute("step", "0.25");
  });

  it("saves the spouse's credit points once their age is entered", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({ age: 50, retirementAge: 65, maritalStatus: "married", spouse: { age: 48 } }),
    );
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const points = await screen.findByLabelText(/^Spouse's tax credit points/);
    expect(points).toHaveValue(null);
    await user.type(points, "2.5");

    await waitFor(async () => {
      expect((await loadProfileFromDb())?.spouse.creditPoints).toBe(2.5);
    });
  });

  it("hides the spouse's credit points until their age is entered", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, retirementAge: 65, maritalStatus: "married" }),
    );
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await screen.findByLabelText(/^Spouse's age/);
    expect(screen.queryByLabelText(/^Spouse's tax credit points/)).not.toBeInTheDocument();
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
