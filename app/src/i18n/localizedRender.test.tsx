import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Dashboard } from "../pages/Dashboard";
import { clearAllData, saveOnboardedToDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import i18n from "./index";

const BIDI_MARKS = /[\u2066-\u2069\u200e\u200f]/g;
const NET_WORTH = "dashboard.kpi.netWorth";

const profile = buildTestProfile({
  age: 55,
  retirementAge: 65,
  pensionBalances: [1_500_000, 300_000],
  otherAssets: 400_000,
  retirementMonthlyExpenses: 15_000,
});

const pageText = () => (document.body.textContent ?? "").replace(BIDI_MARKS, "");

beforeEach(async () => {
  await clearAllData();
  await saveProfileToDb(profile);
  await saveOnboardedToDb(true);
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Dashboard numbers follow the app language", () => {
  it("groups with a dot-free space and decimals with a comma in Russian", async () => {
    await i18n.changeLanguage("ru");
    renderWithProviders(<Dashboard />);
    await screen.findByText(i18n.t(NET_WORTH));

    const text = pageText();
    expect(text).toMatch(/\d\u00a0\d{3}/);
    expect(text).not.toMatch(/\d,\d{3}(?!\d)/);
    expect(text).toMatch(/\d,\d%/);
    expect(text).not.toMatch(/\d\.\d%/);
  });

  it("keeps the English format in English", async () => {
    renderWithProviders(<Dashboard />);
    await screen.findByText(i18n.t(NET_WORTH));
    await waitFor(() => expect(pageText()).toMatch(/\d,\d{3}/));

    const text = pageText();
    expect(text).not.toMatch(/\d\u00a0\d{3}/);
    expect(text).toMatch(/\d\.\d%/);
  });

  it("uses the English separators in Hebrew", async () => {
    await i18n.changeLanguage("he");
    renderWithProviders(<Dashboard />);
    await screen.findByText(i18n.t(NET_WORTH));

    const text = pageText();
    expect(text).toMatch(/\d,\d{3}/);
    expect(text).toMatch(/\d\.\d%/);
  });
});
