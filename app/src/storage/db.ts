import Dexie, { type EntityTable } from "dexie";

import { normalizeProfile, type ProfileData } from "../types";

/**
 * Single-row record wrapping the whole profile. The app currently supports
 * exactly one local profile, so we key it with a fixed singleton id rather
 * than modelling a multi-profile schema we don't need yet.
 */
interface ProfileRecord {
  id: string;
  data: ProfileData;
}

/** Generic key/value row for small app-level flags (e.g. onboarding state). */
interface MetaRecord {
  key: string;
  value: boolean;
}

class IrpDatabase extends Dexie {
  profile!: EntityTable<ProfileRecord, "id">;
  meta!: EntityTable<MetaRecord, "key">;

  constructor() {
    super("IsraeliRetirementPlanningDB");
    // Bump the version number and add a migration block here whenever the
    // stored shape changes in a way existing users' data needs to survive.
    this.version(1).stores({
      profile: "id",
      meta: "key",
    });
  }
}

export const db = new IrpDatabase();

const PROFILE_ID = "current";
const ONBOARDED_KEY = "onboarded";

export async function loadProfileFromDb(): Promise<ProfileData | undefined> {
  const record = await db.profile.get(PROFILE_ID);
  return record?.data;
}

export async function saveProfileToDb(data: ProfileData): Promise<void> {
  await db.profile.put({ id: PROFILE_ID, data });
}

export async function loadOnboardedFromDb(): Promise<boolean> {
  const record = await db.meta.get(ONBOARDED_KEY);
  return record?.value ?? false;
}

export async function saveOnboardedToDb(value: boolean): Promise<void> {
  await db.meta.put({ key: ONBOARDED_KEY, value });
}

/** Wipes all locally stored app data (used by Settings → Reset). */
export async function clearAllData(): Promise<void> {
  await db.profile.clear();
  await db.meta.clear();
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
