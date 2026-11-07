import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllData } from "./db";
import {
  isSafariStorageBrowser,
  readPersistenceStatus,
  requestPersistentStorage,
  requestPersistentStorageOnce,
} from "./persistentStorage";

function stubStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal("navigator", { ...navigator, storage });
}

beforeEach(async () => {
  await clearAllData();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("persistence status", () => {
  it("is unsupported when the browser has no storage manager", async () => {
    stubStorage(undefined);
    expect(await readPersistenceStatus()).toBe("unsupported");
    expect(await requestPersistentStorage()).toBe("unsupported");
  });

  it("reports whether the browser has agreed to keep the data", async () => {
    stubStorage({ persisted: () => Promise.resolve(true) });
    expect(await readPersistenceStatus()).toBe("persisted");

    stubStorage({ persisted: () => Promise.resolve(false) });
    expect(await readPersistenceStatus()).toBe("notPersisted");
  });

  it("is unsupported when the browser throws instead of answering", async () => {
    stubStorage({ persisted: () => Promise.reject(new Error("blocked")) });
    expect(await readPersistenceStatus()).toBe("unsupported");
  });

  it("asks the browser to keep the data and reports its answer", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persisted: () => Promise.resolve(false), persist });
    expect(await requestPersistentStorage()).toBe("persisted");
    expect(persist).toHaveBeenCalledTimes(1);

    stubStorage({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) });
    expect(await requestPersistentStorage()).toBe("notPersisted");
  });

  it("does not ask again when the data is already kept", async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persisted: () => Promise.resolve(true), persist });
    expect(await requestPersistentStorage()).toBe("persisted");
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("requestPersistentStorageOnce", () => {
  it("asks the first time only", async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    stubStorage({ persisted: () => Promise.resolve(false), persist });

    await requestPersistentStorageOnce();
    await requestPersistentStorageOnce();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("asks again after all data was cleared", async () => {
    const persist = vi.fn(() => Promise.resolve(false));
    stubStorage({ persisted: () => Promise.resolve(false), persist });

    await requestPersistentStorageOnce();
    await clearAllData();
    await requestPersistentStorageOnce();

    expect(persist).toHaveBeenCalledTimes(2);
  });
});

describe("isSafariStorageBrowser", () => {
  const identity = (userAgent: string, platform = "Win32", maxTouchPoints = 0) => ({
    userAgent,
    platform,
    maxTouchPoints,
  });

  it.each([
    [
      "Safari on a Mac",
      identity(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "MacIntel",
      ),
    ],
    [
      "Safari on an iPhone",
      identity(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        "iPhone",
        5,
      ),
    ],
    [
      "Chrome on an iPhone, which runs on Safari's engine",
      identity(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1",
        "iPhone",
        5,
      ),
    ],
    [
      "Safari on an iPad that reports itself as a Mac",
      identity(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "MacIntel",
        5,
      ),
    ],
  ])("recognises %s", (_name, browser) => {
    expect(isSafariStorageBrowser(browser)).toBe(true);
  });

  it.each([
    [
      "Chrome on Windows",
      identity(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      ),
    ],
    [
      "Edge on Windows",
      identity(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
      ),
    ],
    [
      "Chrome on Android",
      identity(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36",
        "Linux armv8l",
        5,
      ),
    ],
    [
      "Firefox on Windows",
      identity("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"),
    ],
  ])("does not flag %s", (_name, browser) => {
    expect(isSafariStorageBrowser(browser)).toBe(false);
  });
});
