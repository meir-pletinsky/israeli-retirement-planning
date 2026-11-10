import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearAllData,
  loadBackupSnoozedUntilFromDb,
  loadLastExportedAtFromDb,
  loadProfileFromDb,
  saveBackupSnoozedUntilToDb,
  saveLastExportedAtToDb,
  saveProfileToDb,
} from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { stubDownloads } from "../test/stubDownloads";
import { createEmptyPensionAccount, type ProfileData } from "../types";
import { AppShell } from "./AppShell";

function renderShell(route: string) {
  return renderWithProviders(
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<p>Dashboard page</p>} />
        <Route path="/projections" element={<p>Projections page</p>} />
        <Route path="/my-data/personal" element={<p>My data page</p>} />
        <Route path="/settings" element={<p>Settings page</p>} />
        <Route path="/demo" element={<p>Demo page</p>} />
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

  describe("AppShell — refreshed navigation", () => {
    it("keeps accessible text names while hiding decorative SVG icons", async () => {
      renderShell("/dashboard");
      for (const name of ["Dashboard", "My Data", "Projections", "Settings", "Demo"]) {
        const links = await screen.findAllByRole("link", { name, exact: true });
        expect(links).toHaveLength(2);
        for (const link of links) {
          expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
          if (name === "Dashboard") expect(link).toHaveAttribute("aria-current", "page");
          else expect(link).not.toHaveAttribute("aria-current");
        }
      }
    });

    it("lists Demo last, after Settings, in the sidebar and the phone bar", async () => {
      renderShell("/demo");
      await screen.findByText("Demo page");
      const navs = Array.from(document.querySelectorAll("nav"));
      expect(navs).toHaveLength(2);
      for (const nav of navs) {
        const hrefs = within(nav)
          .getAllByRole("link")
          .map((link) => link.getAttribute("href"));
        expect(hrefs).toEqual(["/dashboard", "/my-data", "/projections", "/settings", "/demo"]);
      }
      for (const link of screen.getAllByRole("link", { name: "Demo", exact: true })) {
        expect(link).toHaveAttribute("aria-current", "page");
      }
    });

    it("places the desktop language menu beside privacy and keeps the phone menu", async () => {
      renderShell("/settings");
      await screen.findByText("Settings page");
      const sidebar = document.querySelector("aside")!;
      expect(within(sidebar).getByRole("combobox", { name: "Language" })).toBeInTheDocument();
      expect(within(sidebar).getByRole("note", { name: "Private by design" })).toBeInTheDocument();
      expect(within(document.querySelector("header")!).getByRole("combobox", { name: "Language" })).toBeInTheDocument();
    });
  });

  it("shows which version is deployed and when it was built", async () => {
    renderShell("/dashboard");

    // The date and time sit in a left-to-right isolate (U+2066 ... U+2069).
    expect(await screen.findByText(/built \u2066\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\u2069/)).toBeInTheDocument();
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

describe("AppShell — backup reminder", () => {
  const REMINDER = "Download a backup of your plan";
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  let downloads: ReturnType<typeof stubDownloads>;

  beforeEach(() => {
    downloads = stubDownloads();
  });

  afterEach(() => {
    downloads.restore();
  });

  async function saveSomeData() {
    await saveProfileToDb(buildTestProfile({ age: 40, pensionBalances: [50_000] }));
  }

  it("is shown on the results pages when the plan was never exported", async () => {
    await saveSomeData();
    renderShell("/dashboard");

    const note = await screen.findByRole("note", { name: REMINDER });
    expect(note).toHaveTextContent("stored only in this browser");
  });

  it("is also shown on the projections page", async () => {
    await saveSomeData();
    renderShell("/projections");

    expect(await screen.findByRole("note", { name: REMINDER })).toBeInTheDocument();
  });

  it("stays out of the way on data entry", async () => {
    await saveSomeData();
    renderShell("/my-data/personal");

    expect(await screen.findByText("My data page")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument();
  });

  it("is not shown on Settings", async () => {
    await saveSomeData();
    renderShell("/settings");

    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument();
  });

  it("is not shown when there is nothing to back up", async () => {
    renderShell("/dashboard");

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument();
  });

  it("downloads the backup, remembers when, and goes away", async () => {
    await saveSomeData();
    const user = userEvent.setup();
    renderShell("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Download backup" }));

    expect(downloads.count()).toBe(1);
    expect(await screen.findByText("Backup downloaded. Keep the file somewhere safe.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument());
    await waitFor(async () => expect(await loadLastExportedAtFromDb()).not.toBeNull());
    expect(new Date((await loadLastExportedAtFromDb())!).getTime()).toBe(Date.now());
  });

  it("hides for a week after 'Remind me later', and remembers that across visits", async () => {
    await saveSomeData();
    const user = userEvent.setup();
    const first = renderShell("/dashboard");

    await user.click(await screen.findByRole("button", { name: "Remind me later" }));

    await waitFor(() => expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument());
    await waitFor(async () => expect(await loadBackupSnoozedUntilFromDb()).not.toBeNull());
    const until = (await loadBackupSnoozedUntilFromDb())!;
    expect(new Date(until).getTime() - Date.now()).toBe(7 * 24 * 3600 * 1000);
    expect(downloads.count()).toBe(0);

    first.unmount();
    renderShell("/dashboard");
    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument();
  });

  it("comes back when the snooze has run out", async () => {
    await saveSomeData();
    await saveBackupSnoozedUntilToDb(daysAgo(1));
    renderShell("/dashboard");

    expect(await screen.findByRole("note", { name: REMINDER })).toBeInTheDocument();
  });

  it("is not shown right after an export", async () => {
    await saveSomeData();
    await saveLastExportedAtToDb(daysAgo(2));
    renderShell("/dashboard");

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: REMINDER })).not.toBeInTheDocument();
  });

  it("names the date of the last export once it is overdue", async () => {
    await saveSomeData();
    await saveLastExportedAtToDb(daysAgo(30));
    renderShell("/dashboard");

    const note = await screen.findByRole("note", { name: REMINDER });
    expect(note.textContent?.replace(/[\u2066\u2069]/g, "")).toContain(
      "You last exported your plan on 16/05/2026.",
    );
  });
});
