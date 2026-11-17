import Dexie, { type EntityTable } from "dexie";

import { normalizeProfile, type ProfileData } from "../types";
import type { VaultKey } from "./sync/snapshotCrypto";

/**
 * Single-row record wrapping the whole profile. The app currently supports
 * exactly one local profile, so we key it with a fixed singleton id rather
 * than modelling a multi-profile schema we don't need yet.
 */
interface ProfileRecord {
  id: string;
  data: ProfileData;
}

/** Generic key/value row for small app-level flags (e.g. onboarding state) and timestamps. */
interface MetaRecord {
  key: string;
  value: boolean | string;
}

/** The plan as it was just before an import replaced it. */
export interface RestorePoint {
  id: string;
  /** ISO timestamp of when the plan was set aside. */
  savedAt: string;
  data: ProfileData;
}

/**
 * Which folder this device keeps its backups in, and how far they are in step with the plan here. It
 * stays on this device and is not part of any backup: the folder handle and the key mean nothing elsewhere.
 */
export interface SyncFolderConfig {
  id: string;
  /** The browser's permission to use the folder travels with the handle, which is why it is kept as is. */
  handle: FileSystemDirectoryHandle;
  folderName: string;
  /** Names this device in the backup files it writes. */
  deviceId: string;
  /** What to call this device in a prompt on another one, e.g. "Edge on Windows". */
  deviceLabel: string;
  /** The key the backups are sealed with, or null when they are written as plain text. */
  vault: VaultKey | null;
  /** The backup this device last saved to the folder or loaded from it. */
  lastSyncedId: string | null;
  /** Fingerprint of the plan as of `lastSyncedId`, to tell whether it changed since. */
  lastSyncedHash: string | null;
  /** ISO timestamp of that. */
  lastSyncedAt: string | null;
}

class IrpDatabase extends Dexie {
  profile!: EntityTable<ProfileRecord, "id">;
  meta!: EntityTable<MetaRecord, "key">;
  restorePoints!: EntityTable<RestorePoint, "id">;
  syncFolder!: EntityTable<SyncFolderConfig, "id">;

  constructor() {
    super("IsraeliRetirementPlanningDB");
    // Bump the version number and add a migration block here whenever the
    // stored shape changes in a way existing users' data needs to survive.
    this.version(1).stores({
      profile: "id",
      meta: "key",
    });
    this.version(2).stores({
      profile: "id",
      meta: "key",
      restorePoints: "id",
    });
    this.version(3).stores({
      profile: "id",
      meta: "key",
      restorePoints: "id",
      syncFolder: "id",
    });
  }
}

export const db = new IrpDatabase();

const PROFILE_ID = "current";
const BEFORE_IMPORT_ID = "before-import";
const SYNC_FOLDER_ID = "current";
const ONBOARDED_KEY = "onboarded";
const FX_LOOKUP_OFF_KEY = "fxLookupOff";
const CPI_LOOKUP_OFF_KEY = "cpiLookupOff";
const LAST_EXPORTED_AT_KEY = "lastExportedAt";
const BACKUP_SNOOZED_UNTIL_KEY = "backupSnoozedUntil";
const PERSISTENCE_ASKED_KEY = "persistenceAsked";
const WHAT_IF_DRAFT_KEY = "whatIfDraft";

export async function loadProfileFromDb(): Promise<ProfileData | undefined> {
  const record = await db.profile.get(PROFILE_ID);
  return record?.data;
}

export async function saveProfileToDb(data: ProfileData): Promise<void> {
  await db.profile.put({ id: PROFILE_ID, data });
}

export async function loadOnboardedFromDb(): Promise<boolean> {
  const record = await db.meta.get(ONBOARDED_KEY);
  return record?.value === true;
}

export async function saveOnboardedToDb(value: boolean): Promise<void> {
  await db.meta.put({ key: ONBOARDED_KEY, value });
}

/** Whether the user allows looking up exchange rates online; on until they turn it off. */
export async function loadFxLookupEnabledFromDb(): Promise<boolean> {
  const record = await db.meta.get(FX_LOOKUP_OFF_KEY);
  return record?.value !== true;
}

export async function saveFxLookupEnabledToDb(enabled: boolean): Promise<void> {
  await db.meta.put({ key: FX_LOOKUP_OFF_KEY, value: !enabled });
}

/** Whether the user allows looking up Israeli inflation online; on until they turn it off. */
export async function loadCpiLookupEnabledFromDb(): Promise<boolean> {
  const record = await db.meta.get(CPI_LOOKUP_OFF_KEY);
  return record?.value !== true;
}

export async function saveCpiLookupEnabledToDb(enabled: boolean): Promise<void> {
  await db.meta.put({ key: CPI_LOOKUP_OFF_KEY, value: !enabled });
}

async function loadTimestamp(key: string): Promise<string | null> {
  const record = await db.meta.get(key);
  return typeof record?.value === "string" ? record.value : null;
}

/** ISO timestamp of the last time the user downloaded a backup of the plan, or null if never. */
export function loadLastExportedAtFromDb(): Promise<string | null> {
  return loadTimestamp(LAST_EXPORTED_AT_KEY);
}

export async function saveLastExportedAtToDb(isoTimestamp: string): Promise<void> {
  await db.meta.put({ key: LAST_EXPORTED_AT_KEY, value: isoTimestamp });
}

/** ISO timestamp until which the user asked not to be reminded about a backup, or null. */
export function loadBackupSnoozedUntilFromDb(): Promise<string | null> {
  return loadTimestamp(BACKUP_SNOOZED_UNTIL_KEY);
}

export async function saveBackupSnoozedUntilToDb(isoTimestamp: string): Promise<void> {
  await db.meta.put({ key: BACKUP_SNOOZED_UNTIL_KEY, value: isoTimestamp });
}

/** Whether this browser has already been asked to keep the plan; it is asked once, not every visit. */
export async function loadPersistenceAskedFromDb(): Promise<boolean> {
  return (await db.meta.get(PERSISTENCE_ASKED_KEY))?.value === true;
}

export async function savePersistenceAskedToDb(): Promise<void> {
  await db.meta.put({ key: PERSISTENCE_ASKED_KEY, value: true });
}

/**
 * The What if tab's draft, kept apart from the plan as JSON text. It is returned unchecked
 * because it is read against the plan by the caller; null when none is stored.
 */
export async function loadWhatIfDraftFromDb(): Promise<unknown> {
  const record = await db.meta.get(WHAT_IF_DRAFT_KEY);
  if (typeof record?.value !== "string") return null;
  try {
    return JSON.parse(record.value);
  } catch {
    return null;
  }
}

/** Stores the draft, or removes it when `draft` is null. */
export async function saveWhatIfDraftToDb(draft: object | null): Promise<void> {
  if (draft === null) await db.meta.delete(WHAT_IF_DRAFT_KEY);
  else await db.meta.put({ key: WHAT_IF_DRAFT_KEY, value: JSON.stringify(draft) });
}

/** Sets the current plan aside so an import can be undone; only the latest one is kept. */
export async function saveBeforeImportRestorePoint(data: ProfileData): Promise<void> {
  await db.restorePoints.put({ id: BEFORE_IMPORT_ID, savedAt: new Date().toISOString(), data });
}

export async function loadBeforeImportRestorePoint(): Promise<RestorePoint | undefined> {
  const record = await db.restorePoints.get(BEFORE_IMPORT_ID);
  return record ? { ...record, data: normalizeProfile(record.data) } : undefined;
}

export async function clearBeforeImportRestorePoint(): Promise<void> {
  await db.restorePoints.delete(BEFORE_IMPORT_ID);
}

export async function loadSyncFolderConfig(): Promise<SyncFolderConfig | undefined> {
  return db.syncFolder.get(SYNC_FOLDER_ID);
}

export async function saveSyncFolderConfig(config: Omit<SyncFolderConfig, "id">): Promise<void> {
  await db.syncFolder.put({ ...config, id: SYNC_FOLDER_ID });
}

/** Changes part of the saved config; does nothing when no folder is connected. */
export async function updateSyncFolderConfig(
  patch: Partial<Pick<SyncFolderConfig, "lastSyncedId" | "lastSyncedHash" | "lastSyncedAt" | "vault">>,
): Promise<void> {
  await db.syncFolder.update(SYNC_FOLDER_ID, patch);
}

/** Disconnects the backup folder; the files in it stay where they are. */
export async function clearSyncFolderConfig(): Promise<void> {
  await db.syncFolder.clear();
}

/** Wipes all locally stored app data (used by Settings → Reset). */
export async function clearAllData(): Promise<void> {
  await db.profile.clear();
  await db.meta.clear();
  await db.restorePoints.clear();
  await db.syncFolder.clear();
}

const LEGACY_PROFILE_KEY = "irp_profile";
const LEGACY_ONBOARDED_KEY = "irp_onboarded";

/**
 * One-time migration for users of the pre-Dexie (localStorage) build. No-ops
 * once the Dexie profile table already has data, or if there's nothing to
 * migrate. Safe to call on every app start.
 */
export async function migrateLegacyLocalStorageIfNeeded(): Promise<void> {
  const existing = await db.profile.get(PROFILE_ID);
  if (existing) return;

  const raw = localStorage.getItem(LEGACY_PROFILE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<ProfileData>;
    await saveProfileToDb(normalizeProfile(parsed));
    await saveOnboardedToDb(localStorage.getItem(LEGACY_ONBOARDED_KEY) === "true");
  } catch {
    // Corrupt legacy data — ignore and let the app start fresh in Dexie.
  } finally {
    localStorage.removeItem(LEGACY_PROFILE_KEY);
    localStorage.removeItem(LEGACY_ONBOARDED_KEY);
  }
}
