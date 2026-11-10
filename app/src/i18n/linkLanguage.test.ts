import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { languageFromSearch } from "./index";

const STORAGE_KEY = "irp_language";

describe("languageFromSearch", () => {
  it.each([
    ["?lng=he", "he"],
    ["?lng=ru", "ru"],
    ["?lng=en", "en"],
    ["?lng=HE", "he"],
    ["?lng=he-IL", "he"],
    ["?lng=he%20", "he"],
    ["?utm_source=whatsapp&lng=ru&x=1", "ru"],
  ])("reads %s as %s", (search, expected) => {
    expect(languageFromSearch(search)).toBe(expected);
  });

  it.each(["", "?", "?lng=", "?lng=fr", "?lng=zz-he", "?lang=he"])("ignores %j", (search) => {
    expect(languageFromSearch(search)).toBeNull();
  });
});

describe("a language in the link", () => {
  async function loadApp(search: string, saved: string | null) {
    window.history.replaceState({}, "", `/${search}`);
    if (saved === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, saved);
    vi.resetModules();
    return (await import("./index")).default;
  }

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
    window.localStorage.clear();
  });

  it("wins over the saved language for this visit without replacing it", async () => {
    const i18n = await loadApp("?lng=he", "ru");

    expect(i18n.language).toBe("he");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("ru");
  });

  it("leaves nothing saved for a visitor who had no saved language", async () => {
    const i18n = await loadApp("?lng=ru", null);

    expect(i18n.language).toBe("ru");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("saves a language picked in the switcher afterwards", async () => {
    const i18n = await loadApp("?lng=he", "ru");

    await i18n.changeLanguage("en");

    expect(i18n.language).toBe("en");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
  });

  it("is ignored when it names a language the app does not have", async () => {
    const i18n = await loadApp("?lng=fr", "ru");

    expect(i18n.language).toBe("ru");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("ru");
  });

  it("changes nothing without a language in the link", async () => {
    const i18n = await loadApp("", "he");

    expect(i18n.language).toBe("he");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("he");
  });
});
