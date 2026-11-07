import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFxCache } from "../fx/client";
import {
  clearAllData,
  loadBeforeImportRestorePoint,
  loadCpiLookupEnabledFromDb,
  loadFxLookupEnabledFromDb,
  loadLastExportedAtFromDb,
  loadProfileFromDb,
  saveBeforeImportRestorePoint,
  saveCpiLookupEnabledToDb,
  saveFxLookupEnabledToDb,
  saveLastExportedAtToDb,
  saveProfileToDb,
} from "../storage/db";
import { buildTestProfile } from "../test/domainFixtures";
import { renderWithProviders } from "../test/renderWithProviders";
import { stubDownloads } from "../test/stubDownloads";
import { Settings } from "./Settings";

const TODAY = { date: "2026-10-30", base: "USD", quote: "ILS", rate: 3.118 };

const fetchMock = vi.fn<typeof fetch>();

beforeEach(async () => {
  await clearAllData();
  resetFxCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(TODAY) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const lookupBox = () => screen.findByRole("checkbox", { name: "Look up exchange rates online" });

describe("Settings — exchange rates", () => {
  it("has the online lookup on by default, and says what is sent", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).toBeChecked();
    expect(screen.getByText(/Only the currency pair and a date are sent/)).toBeInTheDocument();
  });

  it("shows the current rate with its day, and says it is checked every hour", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    const status = await screen.findByText(/Current rate: ₪3[.,]118 per US dollar \(Bank of Israel, 30\/10\/2026\)/);
    expect(status).toHaveTextContent("Checked every hour while the app is open.");
    expect(status).toHaveAttribute("role", "status");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.frankfurter.dev/v2/rate/usd/ils?providers=boi");
  });

  it("says so when the current rate cannot be loaded", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("offline")));
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText("The current rate could not be loaded. It will be tried again within the hour.")).toBeInTheDocument();
    expect(screen.queryByText(/Current rate:/)).not.toBeInTheDocument();
  });

  it("shows no rate and asks for none while the lookup is turned off", async () => {
    await saveFxLookupEnabledToDb(false);
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).not.toBeChecked();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns the lookup off and on, and remembers the choice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByText(/Current rate:/);

    await user.click(await lookupBox());
    expect(await lookupBox()).not.toBeChecked();
    expect(screen.queryByText(/Current rate:/)).not.toBeInTheDocument();
    await waitFor(async () => expect(await loadFxLookupEnabledFromDb()).toBe(false));

    await user.click(await lookupBox());
    await waitFor(async () => expect(await loadFxLookupEnabledFromDb()).toBe(true));
    expect(await screen.findByText(/Current rate:/)).toBeInTheDocument();
  });

  it("shows a lookup that was turned off earlier as off", async () => {
    await saveFxLookupEnabledToDb(false);
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).not.toBeChecked();
  });

  it("is turned back on when all data is cleared", async () => {
    await saveFxLookupEnabledToDb(false);
    await clearAllData();
    expect(await loadFxLookupEnabledFromDb()).toBe(true);
  });
});

describe("Settings — inflation data", () => {
  const cpiBox = () => screen.findByRole("checkbox", { name: "Look up Israeli inflation online" });

  it("has the online lookup on by default, and says what is sent", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await cpiBox()).toBeChecked();
    expect(screen.getByText(/The request carries nothing about you: no cookies and no referrer/)).toBeInTheDocument();
  });

  it("is separate from the exchange rate lookup", async () => {
    await saveFxLookupEnabledToDb(false);
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await lookupBox()).not.toBeChecked();
    expect(await cpiBox()).toBeChecked();
  });

  it("turns the lookup off and on, and remembers the choice", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });

    await user.click(await cpiBox());
    expect(await cpiBox()).not.toBeChecked();
    await waitFor(async () => expect(await loadCpiLookupEnabledFromDb()).toBe(false));
    expect(await loadFxLookupEnabledFromDb()).toBe(true);

    await user.click(await cpiBox());
    await waitFor(async () => expect(await loadCpiLookupEnabledFromDb()).toBe(true));
  });

  it("shows a lookup that was turned off earlier as off", async () => {
    await saveCpiLookupEnabledToDb(false);
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await cpiBox()).not.toBeChecked();
  });

  it("is turned back on when all data is cleared", async () => {
    await saveCpiLookupEnabledToDb(false);
    await clearAllData();
    expect(await loadCpiLookupEnabledFromDb()).toBe(true);
  });

  it("asks for nothing on this page", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });
    await cpiBox();

    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("cbs.gov.il"))).toBe(true);
  });
});

describe("Settings — import protects the current plan", () => {
  const savedPlan = buildTestProfile({ age: 52, retirementAge: 65, pensionBalances: [400_000, 100_000] });
  const fileProfile = buildTestProfile({ age: 38, retirementAge: 60, pensionBalances: [90_000] });

  function jsonFile(content: unknown, name = "my-plan.json") {
    return new File([JSON.stringify(content)], name, { type: "application/json" });
  }

  async function chooseFile(user: ReturnType<typeof userEvent.setup>, file: File) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error("no file input");
    await user.upload(input, file);
  }

  const savedAge = async () => (await loadProfileFromDb())?.personal.age;

  it("imports straight away when there is no plan to lose", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });

    await chooseFile(user, jsonFile(fileProfile));

    expect(await screen.findByText("Data imported successfully.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(async () => expect(await savedAge()).toBe(38));
    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
    expect(screen.queryByRole("button", { name: /Restore the plan/ })).not.toBeInTheDocument();
  });

  it("asks first, comparing the current plan with the file, and changes nothing until confirmed", async () => {
    await saveProfileToDb(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });

    await chooseFile(user, jsonFile(fileProfile));

    const dialog = await screen.findByRole("dialog", { name: "Replace your current plan?" });
    expect(dialog).toHaveTextContent("Importing my-plan.json replaces everything in your current plan.");
    const ageRow = within(dialog).getByRole("row", { name: /^Age/ });
    expect(within(ageRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["52", "38"]);
    const accountsRow = within(dialog).getByRole("row", { name: /^Pension & savings accounts/ });
    expect(within(accountsRow).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["2", "1"]);
    expect(await savedAge()).toBe(52);
    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
  });

  it("leaves the plan alone when cancelled", async () => {
    await saveProfileToDb(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });
    await chooseFile(user, jsonFile(fileProfile));

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await savedAge()).toBe(52);
    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
    expect(screen.queryByText("Data imported successfully.")).not.toBeInTheDocument();
  });

  it("warns about parts of the plan the file has nothing for", async () => {
    await saveProfileToDb(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });

    await chooseFile(user, jsonFile({ ...fileProfile, pensionSavings: undefined }));

    const warning = await within(await screen.findByRole("dialog")).findByRole("alert");
    expect(warning).toHaveTextContent("The file has nothing for: Pension & savings.");
  });

  it("does not warn when the file carries everything the plan has", async () => {
    await saveProfileToDb(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });

    await chooseFile(user, jsonFile(fileProfile));

    await screen.findByRole("dialog");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves the plan first when confirmed, then lets the user restore it", async () => {
    await saveProfileToDb(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });
    await chooseFile(user, jsonFile(fileProfile));

    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Replace my plan" }));

    expect(await screen.findByText(/Your previous plan is saved/)).toBeInTheDocument();
    await waitFor(async () => expect(await savedAge()).toBe(38));
    expect((await loadBeforeImportRestorePoint())?.data.personal.age).toBe(52);

    await user.click(await screen.findByRole("button", { name: "Restore the plan from before the last import" }));
    const confirm = await screen.findByRole("dialog", { name: "Restore your previous plan?" });
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Previous plan restored.")).toBeInTheDocument();
    await waitFor(async () => expect(await savedAge()).toBe(52));
    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
    expect(screen.queryByRole("button", { name: /Restore the plan/ })).not.toBeInTheDocument();
  });

  it("offers a restore point saved in an earlier visit, and keeps the plan if the restore is declined", async () => {
    await saveProfileToDb(fileProfile);
    await saveBeforeImportRestorePoint(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });

    await user.click(await screen.findByRole("button", { name: "Restore the plan from before the last import" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(await savedAge()).toBe(38);
    expect((await loadBeforeImportRestorePoint())?.data.personal.age).toBe(52);
  });

  it("rejects a file that is not an export without touching the plan", async () => {
    await saveProfileToDb(savedPlan);
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });
    await screen.findByRole("heading", { name: "Settings" });

    await chooseFile(user, jsonFile({ foo: "bar" }));

    expect(await screen.findByText(/Couldn't import this file/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await savedAge()).toBe(52);
  });
});

describe("Settings — privacy", () => {
  it("explains what stays on the device and the three things that are requested", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    const heading = await screen.findByRole("heading", { name: "Privacy" });
    const section = heading.closest("section") as HTMLElement;
    expect(section).toHaveTextContent("saved in this browser only");
    expect(section).toHaveTextContent("Exchange rates:");
    expect(section).toHaveTextContent("Inflation figures:");
    expect(section).toHaveTextContent("Stock prices:");
    expect(section).toHaveTextContent("The app never uploads them.");
  });
});

describe("Settings — keeping the plan safe", () => {
  // The dates are wrapped in direction marks so they read correctly inside right-to-left text.
  const plain = {
    normalizer: (text: string) =>
      text
        .replace(/[\u2066\u2069]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
  };

  function stubBrowser(overrides: { storage?: Partial<StorageManager>; userAgent?: string }) {
    if (overrides.storage) {
      Object.defineProperty(navigator, "storage", { configurable: true, value: overrides.storage });
    }
    if (overrides.userAgent) {
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: overrides.userAgent });
    }
  }

  let downloads: ReturnType<typeof stubDownloads>;

  beforeEach(() => {
    downloads = stubDownloads();
  });

  afterEach(() => {
    downloads.restore();
    Reflect.deleteProperty(navigator, "storage");
    Reflect.deleteProperty(navigator, "userAgent");
  });

  it("says the plan was never exported, then shows the date once it is", async () => {
    await saveProfileToDb(buildTestProfile({ age: 40 }));
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText("Last exported: never")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export data" }));

    expect(downloads.count()).toBe(1);
    expect(await screen.findByText(/^Last exported: \d{2}\/\d{2}\/\d{4}$/, plain)).toBeInTheDocument();
    expect(await loadLastExportedAtFromDb()).not.toBeNull();
  });

  it("shows the date of an earlier export", async () => {
    await saveLastExportedAtToDb("2026-06-01T09:00:00.000Z");
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText("Last exported: 01/06/2026", plain)).toBeInTheDocument();
  });

  it("says when the browser has agreed to keep the plan, and offers nothing to ask", async () => {
    stubBrowser({ storage: { persisted: () => Promise.resolve(true) } });
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText("Your browser has agreed to keep this plan.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask my browser to keep this plan" })).not.toBeInTheDocument();
  });

  it("warns when the browser may clear the plan, and lets the user ask it to keep it", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubBrowser({ storage: { persisted: () => Promise.resolve(false), persist } });
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText(/Your browser may clear this plan/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ask my browser to keep this plan" }));

    expect(persist).toHaveBeenCalled();
    expect(await screen.findByText("Your browser has agreed to keep this plan.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask my browser to keep this plan" })).not.toBeInTheDocument();
  });

  it("says so when the browser declines", async () => {
    stubBrowser({
      storage: { persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) },
    });
    const user = userEvent.setup();
    renderWithProviders(<Settings />, { route: "/settings" });

    await user.click(await screen.findByRole("button", { name: "Ask my browser to keep this plan" }));

    expect(await screen.findByText(/It declined when asked\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask my browser to keep this plan" })).toBeInTheDocument();
  });

  it("says the browser cannot confirm when it has no storage manager", async () => {
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText(/cannot confirm that it will keep this plan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask my browser to keep this plan" })).not.toBeInTheDocument();
  });

  it("warns Safari users that the browser may erase the data after a week", async () => {
    stubBrowser({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    });
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText(/Safari, and every browser on an iPhone or iPad/)).toBeInTheDocument();
  });

  it("does not show the Safari warning in other browsers", async () => {
    stubBrowser({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    });
    renderWithProviders(<Settings />, { route: "/settings" });

    expect(await screen.findByText(/Last exported/)).toBeInTheDocument();
    expect(screen.queryByText(/Safari, and every browser/)).not.toBeInTheDocument();
  });
});
