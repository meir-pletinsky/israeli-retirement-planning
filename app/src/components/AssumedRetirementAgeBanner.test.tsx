import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PersonalStep } from "../pages/MyData/PersonalStep";
import { clearAllData, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { AssumedRetirementAgeBanner } from "./AssumedRetirementAgeBanner";
import { RETIREMENT_AGE_TARGET } from "./retirementAgeTargets";

beforeEach(async () => {
  await clearAllData();
});

describe("AssumedRetirementAgeBanner", () => {
  it("says nothing once the retirement age is entered", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50, retirementAge: 62 }));
    const { container } = renderWithProviders(<AssumedRetirementAgeBanner />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("names the assumed age and links to the field that sets it", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50 }));
    renderWithProviders(<AssumedRetirementAgeBanner />);

    const note = await screen.findByRole("note", { name: "Assumed retirement age" });
    expect(note).toHaveTextContent("Using an assumed retirement age of 67");
    expect(within(note).getByRole("link", { name: "Set your retirement age" })).toHaveAttribute(
      "href",
      RETIREMENT_AGE_TARGET.self,
    );
    expect(within(note).queryByText(/spouse/i)).not.toBeInTheDocument();
  });

  it("also covers a spouse who is in the plan without a retirement age", async () => {
    await saveProfileToDb(
      buildTestProfile({
        age: 50,
        retirementAge: 62,
        maritalStatus: "married",
        spouse: { age: 48 },
      }),
    );
    renderWithProviders(<AssumedRetirementAgeBanner />);

    const note = await screen.findByRole("note", { name: "Assumed retirement age" });
    expect(note).toHaveTextContent("assumed retirement age of 67 for your spouse");
    expect(within(note).queryByRole("link", { name: "Set your retirement age" })).toBeNull();
    expect(
      within(note).getByRole("link", { name: "Set your spouse's retirement age" }),
    ).toHaveAttribute("href", RETIREMENT_AGE_TARGET.spouse);
  });
});

describe("Retirement age fields", () => {
  it("carry the id the links open and hint at the age used while empty", async () => {
    await saveProfileToDb(buildTestProfile({ age: 50 }));
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal" });

    const field = await screen.findByLabelText(/^Desired retirement age/);
    expect(field).toHaveAttribute("id", "retirement-age");
    expect(field).toHaveAttribute("placeholder", "67 if empty");
    expect(RETIREMENT_AGE_TARGET.self.endsWith("#retirement-age")).toBe(true);
  });

  it("do the same for the spouse, on the partner's tab", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 50, retirementAge: 62, maritalStatus: "married", spouse: { age: 48 } }),
    );
    renderWithProviders(<PersonalStep />, { route: "/my-data/personal?person=spouse" });

    const field = await screen.findByLabelText(/^Spouse's retirement age/);
    expect(field).toHaveAttribute("id", "spouse-retirement-age");
    expect(field).toHaveAttribute("placeholder", "67 if empty");
    expect(RETIREMENT_AGE_TARGET.spouse).toContain("?person=spouse#spouse-retirement-age");
  });
});
