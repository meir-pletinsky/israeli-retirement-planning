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

  async function openPartnerTab(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("tab", { name: /^Partner/ }));
  }

  it("shows the spouse section only for a married user", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await screen.findByLabelText(/Monthly gross salary/);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Marital status/), "married");
    await openPartnerTab(user);

    expect(screen.getByLabelText(/^Spouse's age/)).toBeInTheDocument();
    // Everything else waits for the spouse's age.
    expect(screen.queryByLabelText(/^Spouse's retirement age/)).not.toBeInTheDocument();
  });

  it("keeps the user's fields on their own tab and the partner's on the Partner tab", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile({ ...married, spouse: { age: 48 } }));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const meTab = await screen.findByRole("tab", { name: /^Me/ });
    expect(meTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^Partner/ })).toHaveTextContent("Age 48");
    expect(screen.getByLabelText(/^Marital status/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();

    await openPartnerTab(user);
    expect(screen.getByLabelText(/^Spouse's age/)).toHaveValue(48);
    expect(screen.queryByLabelText(/^Marital status/)).not.toBeInTheDocument();
  });

  it("saves the spouse's details once their age is entered", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile(married));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await openPartnerTab(user);
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

    await openPartnerTab(user);
    await screen.findByLabelText(/^Spouse's retirement age/);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
  });

  it("flags the Partner tab and opens it when Next is blocked by the partner's data", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile({ ...married, spouse: { age: 48 } }));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const partnerTab = await screen.findByRole("tab", { name: /^Partner/ });
    expect(partnerTab).not.toHaveTextContent("Needs attention");
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(partnerTab).toHaveAttribute("aria-selected", "true"));
    expect(partnerTab).toHaveTextContent("Needs attention");
    expect(screen.getByRole("tab", { name: /^Me/ })).not.toHaveTextContent("Needs attention");
  });

  it("opens the user's own tab first when both people have something to fix", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({ maritalStatus: "married", age: null, retirementAge: null, spouse: { age: 48 } }),
    );
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await openPartnerTab(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(screen.getByRole("tab", { name: /^Me/ })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByRole("tab", { name: /^Me/ })).toHaveTextContent("Needs attention");
    expect(screen.getByRole("tab", { name: /^Partner/ })).toHaveTextContent("Needs attention");
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

    await user.selectOptions(await screen.findByLabelText(/^Marital status/), "divorced");

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();
    // The details are kept, so switching back does not lose them.
    await user.selectOptions(screen.getByLabelText(/^Marital status/), "married");
    await openPartnerTab(user);
    expect(screen.getByLabelText(/^Spouse's age/)).toHaveValue(48);
  });

  it("says that only married couples can share calculations", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    expect(await screen.findByRole("note")).toHaveTextContent(
      "available only for married couples. Common-law partners count as married.",
    );

    await user.selectOptions(screen.getByLabelText(/^Marital status/), "married");
    expect(screen.getByRole("note")).toHaveTextContent("Open the Partner tab");
  });
});

describe("PersonalStep — what is required", () => {
  it("tags the two ages as required and the rest as recommended or optional", async () => {
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const age = await screen.findByLabelText(/^Age/);
    expect(age).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText(/^Desired retirement age/)).toHaveAttribute("aria-required", "true");

    expect(screen.getByLabelText(/^Gender/)).not.toHaveAttribute("aria-required");
    expect(screen.getByLabelText(/^Gender/).closest("label")).toHaveTextContent("Recommended");
    expect(screen.getByLabelText(/^Monthly gross salary/).closest("label")).toHaveTextContent("Recommended");
    expect(screen.getByLabelText(/^Age/).closest("label")).toHaveTextContent("Required");
    // Tax credit points have a default, so they carry no tag.
    const points = screen.getByLabelText(/^Tax credit points/).closest("label");
    expect(points).not.toHaveTextContent(/Required|Recommended|Reference only/);
  });

  it("lets a person with no partner continue with only the two ages", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(buildTestProfile({ age: 45, retirementAge: 62 }));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await user.click(await screen.findByRole("button", { name: "Next" }));

    expect(screen.queryByText("This field is required.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();
  });

  it.each(["single", "divorced", "widowed"] as const)(
    "shows no spouse section for a %s user",
    async (maritalStatus) => {
      await saveProfileToDb(buildTestProfile({ age: 45, retirementAge: 62, maritalStatus }));
      renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

      await screen.findByLabelText(/^Marital status/);
      expect(screen.queryByLabelText(/^Spouse's age/)).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: /Spouse or partner/ })).not.toBeInTheDocument();
    },
  );

  it("blocks Next and names the missing age when it is empty", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await user.click(await screen.findByRole("button", { name: "Next" }));

    expect(await screen.findAllByText("This field is required.")).toHaveLength(2);
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

    await user.click(await screen.findByRole("tab", { name: /^Partner/ }));
    const points = await screen.findByLabelText(/^Spouse's tax credit points/);
    expect(points).toHaveValue(null);
    await user.type(points, "2.5");

    await waitFor(async () => {
      expect((await loadProfileFromDb())?.spouse.creditPoints).toBe(2.5);
    });
  });

  it("hides the spouse's credit points until their age is entered", async () => {
    const user = userEvent.setup();
    await saveProfileToDb(
      buildTestProfile({ age: 50, retirementAge: 65, maritalStatus: "married" }),
    );
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    await user.click(await screen.findByRole("tab", { name: /^Partner/ }));
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
