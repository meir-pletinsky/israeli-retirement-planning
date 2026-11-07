import { loadPersistenceAskedFromDb, savePersistenceAskedToDb } from "./db";

/**
 * Whether the browser promises to keep this site's data when the device runs low on space.
 * "unsupported" means the browser cannot say, so the plan should be treated as erasable.
 */
export type PersistenceStatus = "persisted" | "notPersisted" | "unsupported";

function storageManager(): StorageManager | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.storage;
}

export async function readPersistenceStatus(): Promise<PersistenceStatus> {
  const storage = storageManager();
  if (!storage || typeof storage.persisted !== "function") return "unsupported";
  try {
    return (await storage.persisted()) ? "persisted" : "notPersisted";
  } catch {
    return "unsupported";
  }
}

/**
 * Asks the browser not to evict the stored plan. Some browsers grant it silently, some ask the
 * user, some refuse; the answer is the resulting status. Never throws.
 */
export async function requestPersistentStorage(): Promise<PersistenceStatus> {
  const storage = storageManager();
  if (!storage || typeof storage.persist !== "function") return "unsupported";
  try {
    if (await storage.persisted?.()) return "persisted";
    return (await storage.persist()) ? "persisted" : "notPersisted";
  } catch {
    return "unsupported";
  }
}

/**
 * Asks the browser to keep the plan, but only the first time this browser holds one: some browsers
 * show a prompt, and it should not return on every visit. Settings can ask again on request.
 */
export async function requestPersistentStorageOnce(): Promise<void> {
  if (await loadPersistenceAskedFromDb()) return;
  await savePersistenceAskedToDb();
  await requestPersistentStorage();
}

interface BrowserIdentity {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

/**
 * Safari, and every browser on an iPhone or iPad (they all run on Safari's engine), erases a site's
 * stored data after about a week without a visit unless the site is added to the Home Screen.
 */
export function isSafariStorageBrowser({ userAgent, platform, maxTouchPoints }: BrowserIdentity): boolean {
  const isIos = /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIos) return true;
  return /Safari\//.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Android|Firefox/.test(userAgent);
}

export function currentBrowserIsSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return isSafariStorageBrowser({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  });
}
