import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { clearAllData, loadProfileFromDb, saveProfileToDb } from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { createEmptyPensionAccount, type ProfileData } from "../types";
import { AppShell } from "./AppShell";

function renderShell(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
        <Route path="/settings" element={<p>Settings page</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

beforeEach(async () => {
  await clearAllData();
});

describe("AppShell — home link and build info", () => {
  it("takes the logo and title back to the home page", async () => {
    renderShell("/settings");

    const links = await screen.findAllByRole("link", { name: "Israeli Retirement Planning" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/");
  });

  it("shows which version is deployed and when it was built", async () => {
    renderShell("/dashboard");

    expect(await screen.findByText(/built \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/^Version [0-9a-f]{7}$|^Development build$/)).toBeInTheDocument();
  });
});

describe("AppShell — privacy banner", () => {
  it("shows the full privacy note next to the navigation and a one-line version for phones", async () => {
    renderShell("/dashboard");

    const note = await screen.findByRole("note", { name: "Private by design" });
    expect(note).toHaveTextContent("Your data stays on this device. Nothing is uploaded to a server");
    expect(within(note).getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/settings");

    const strip = screen.getByRole("link", { name: "Your data stays on this device. Nothing is uploaded." });
    expect(strip).toHaveAttribute("href", "/settings");
  });

  it("keeps the note on every page", async () => {
    renderShell("/settings");

    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Private by design" })).toBeInTheDocument();
  });
});

describe("AppShell — sample data notice", () => {
  const SAMPLE_ID = "sample-report";
  const NOTICE = "Sample accounts are part of your results";

  function profileWithSample(): ProfileData {
    const base = buildTestProfile({ age: 40, pensionBalances: [50_000] });
    const sampleAccount = (id: string) => ({ ...createEmptyPensionAccount(), id, reportId: SAMPLE_ID });
    return {
      ...base,
      pensionSavings: {
        ...base.pensionSavings,
        accounts: [...base.pensionSavings.accounts, sampleAccount("demo-1"), sampleAccount("demo-2")],
        reports: [
          {
            id: SAMPLE_ID,
            owner: "self",
            personKeys: [],
            firstName: null,
            ageAtImport: null,
            reportDate: null,
            importedAt: "2026-05-02",
            sample: true,
          },
        ],
      },
    };
  }

  it("is not shown when the plan has no sample accounts", async () => {
    await saveProfileToDb(buildTestProfile({ age: 40, pensionBalances: [50_000] }));
    renderShell("/dashboard");

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: NOTICE })).not.toBeInTheDocument();
  });

  it("is shown above the page while sample accounts are in the plan, and says how many", async () => {
    await saveProfileToDb(profileWithSample());
    renderShell("/dashboard");

    const notice = await screen.findByRole("note", { name: NOTICE });
    expect(notice).toHaveTextContent(
      "2 made-up accounts from the sample report are counted in every figure in the app.",
    );
  });

  it("removes only the sample accounts after a confirmation", async () => {
    await saveProfileToDb(profileWithSample());
    const user = userEvent.setup();
    renderShell("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Remove sample accounts" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove the sample accounts?" });
    // Cancelling changes nothing.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("note", { name: NOTICE })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove sample accounts" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove sample accounts" }),
    );

    await waitFor(() => expect(screen.queryByRole("note", { name: NOTICE })).not.toBeInTheDocument());
    const saved = await waitFor(async () => {
      const profile = await loadProfileFromDb();
      expect(profile?.pensionSavings.accounts).toHaveLength(1);
      return profile!;
    });
    expect(saved.pensionSavings.accounts[0].totalAccumulatedBalance).toBe(50_000);
    expect(saved.pensionSavings.reports).toEqual([]);
  });
});
