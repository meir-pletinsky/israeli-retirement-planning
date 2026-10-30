import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { EMPTY_PROFILE } from "../types";
import { App } from "./App";

const WELCOME_TITLE = "Your retirement plan, on your device";

beforeEach(async () => {
  await clearAllData();
});

describe("App start page", () => {
  it("shows the welcome page to a new visitor", async () => {
    renderWithProviders(<App />);

    expect(await screen.findByText(WELCOME_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start my plan" })).toBeInTheDocument();
  });

  it("goes straight to the dashboard when the saved profile has data, even if the My Data steps were never finished", async () => {
    await saveProfileToDb(
      buildTestProfile({ age: 45, retirementAge: 67, pensionBalances: [250000] }),
    );

    renderWithProviders(<App />);

    expect(await screen.findByText("Projected Monthly Income After Tax")).toBeInTheDocument();
    expect(screen.queryByText(WELCOME_TITLE)).not.toBeInTheDocument();
  });

  it("goes to the dashboard when the profile was finished", async () => {
    await saveProfileToDb(buildTestProfile({ age: 45, retirementAge: 67 }));
    await saveOnboardedToDb(true);

    renderWithProviders(<App />);

    expect(await screen.findByText("Projected Monthly Income After Tax")).toBeInTheDocument();
    expect(screen.queryByText(WELCOME_TITLE)).not.toBeInTheDocument();
  });

  it("still shows the welcome page when the saved profile is empty", async () => {
    await saveProfileToDb(EMPTY_PROFILE);

    renderWithProviders(<App />);

    expect(await screen.findByText(WELCOME_TITLE)).toBeInTheDocument();
  });
});
