import { beforeEach, describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  clearAllData,
  clearBeforeImportRestorePoint,
  clearSyncFolderConfig,
  loadBackupSnoozedUntilFromDb,
  loadBeforeImportRestorePoint,
  loadCpiLookupEnabledFromDb,
  loadFxLookupEnabledFromDb,
  loadLastExportedAtFromDb,
  loadOnboardedFromDb,
  loadSyncFolderConfig,
  loadWhatIfDraftFromDb,
  saveBackupSnoozedUntilToDb,
  saveBeforeImportRestorePoint,
  saveCpiLookupEnabledToDb,
  saveFxLookupEnabledToDb,
  saveLastExportedAtToDb,
  saveOnboardedToDb,
  saveSyncFolderConfig,
  saveWhatIfDraftToDb,
  updateSyncFolderConfig,
} from "./db";
import { decryptPayload, deriveVaultKey, encryptPayload } from "./sync/snapshotCrypto";

beforeEach(async () => {
  await clearAllData();
});

describe("before-import restore point", () => {
  it("is absent until one is saved", async () => {
    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
  });

  it("keeps the saved plan and when it was saved", async () => {
    const plan = buildTestProfile({ age: 52, pensionBalances: [300_000] });
    const before = Date.now();

    await saveBeforeImportRestorePoint(plan);
    const point = await loadBeforeImportRestorePoint();

    expect(point?.data).toEqual(plan);
    expect(Date.parse(point?.savedAt ?? "")).toBeGreaterThanOrEqual(before);
  });

  it("keeps only the latest one", async () => {
    await saveBeforeImportRestorePoint(buildTestProfile({ age: 40 }));
    await saveBeforeImportRestorePoint(buildTestProfile({ age: 41 }));

    expect((await loadBeforeImportRestorePoint())?.data.personal.age).toBe(41);
  });

  it("can be cleared", async () => {
    await saveBeforeImportRestorePoint(buildTestProfile({ age: 40 }));
    await clearBeforeImportRestorePoint();

    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
  });

  it("is deleted together with all other data", async () => {
    await saveBeforeImportRestorePoint(buildTestProfile({ age: 40 }));
    await clearAllData();

    expect(await loadBeforeImportRestorePoint()).toBeUndefined();
  });
});

describe("What if draft", () => {
  it("is absent until saved, and a saved one comes back as written", async () => {
    expect(await loadWhatIfDraftFromDb()).toBeNull();

    const draft = { overrides: { retirementAge: 62 }, basis: "sustainable", column: "monthlySpending" };
    await saveWhatIfDraftToDb(draft);

    expect(await loadWhatIfDraftFromDb()).toEqual(draft);
  });

  it("is deleted by saving nothing, and together with all other data", async () => {
    await saveWhatIfDraftToDb({ overrides: { retirementAge: 62 } });
    await saveWhatIfDraftToDb(null);
    expect(await loadWhatIfDraftFromDb()).toBeNull();

    await saveWhatIfDraftToDb({ overrides: { retirementAge: 62 } });
    await clearAllData();
    expect(await loadWhatIfDraftFromDb()).toBeNull();
  });

  it("leaves the settings stored beside it untouched", async () => {
    await saveOnboardedToDb(true);
    await saveWhatIfDraftToDb({ overrides: { retirementAge: 62 } });
    await saveWhatIfDraftToDb(null);

    expect(await loadOnboardedFromDb()).toBe(true);
  });
});

describe("backup timestamps", () => {
  it("are absent until saved", async () => {
    expect(await loadLastExportedAtFromDb()).toBeNull();
    expect(await loadBackupSnoozedUntilFromDb()).toBeNull();
  });

  it("keep the moment of the last export and how long the reminder is snoozed", async () => {
    await saveLastExportedAtToDb("2026-06-01T08:00:00.000Z");
    await saveBackupSnoozedUntilToDb("2026-06-08T08:00:00.000Z");

    expect(await loadLastExportedAtFromDb()).toBe("2026-06-01T08:00:00.000Z");
    expect(await loadBackupSnoozedUntilFromDb()).toBe("2026-06-08T08:00:00.000Z");
  });

  it("are deleted together with all other data", async () => {
    await saveLastExportedAtToDb("2026-06-01T08:00:00.000Z");
    await saveBackupSnoozedUntilToDb("2026-06-08T08:00:00.000Z");
    await clearAllData();

    expect(await loadLastExportedAtFromDb()).toBeNull();
    expect(await loadBackupSnoozedUntilFromDb()).toBeNull();
  });

  it("leave the on/off settings stored beside them untouched", async () => {
    await saveOnboardedToDb(true);
    await saveFxLookupEnabledToDb(false);
    await saveCpiLookupEnabledToDb(false);
    await saveLastExportedAtToDb("2026-06-01T08:00:00.000Z");

    expect(await loadOnboardedFromDb()).toBe(true);
    expect(await loadFxLookupEnabledFromDb()).toBe(false);
    expect(await loadCpiLookupEnabledFromDb()).toBe(false);
  });

  it("are not mistaken for an on/off setting", async () => {
    await saveLastExportedAtToDb("2026-06-01T08:00:00.000Z");

    expect(await loadOnboardedFromDb()).toBe(false);
    expect(await loadFxLookupEnabledFromDb()).toBe(true);
  });
});

describe("backup folder config", () => {
  const handle = { kind: "directory", name: "Backups" } as unknown as FileSystemDirectoryHandle;
  const base = {
    handle,
    folderName: "Backups",
    deviceId: "abcd1234-ef56",
    deviceLabel: "Edge on Windows",
    vault: null,
    lastSyncedId: null,
    lastSyncedHash: null,
    lastSyncedAt: null,
  };

  it("is absent until a folder is connected", async () => {
    expect(await loadSyncFolderConfig()).toBeUndefined();
  });

  it("keeps the folder and changes to how far it is in step", async () => {
    await saveSyncFolderConfig(base);
    await updateSyncFolderConfig({ lastSyncedId: "20260615T102030456Z-abcd1234", lastSyncedHash: "h1" });

    const config = await loadSyncFolderConfig();

    expect(config?.folderName).toBe("Backups");
    expect(config?.lastSyncedId).toBe("20260615T102030456Z-abcd1234");
    expect(config?.lastSyncedHash).toBe("h1");
  });

  it("keeps a key that can still open a backup", async () => {
    const vault = await deriveVaultKey("correct horse", undefined, { iterations: 1000 });
    const sealed = await encryptPayload(vault, "20260615T102030456Z-abcd1234", { personal: { age: 50 } });
    await saveSyncFolderConfig({ ...base, vault });

    const stored = (await loadSyncFolderConfig())?.vault;

    expect(stored).toBeTruthy();
    const envelope = {
      app: "israeli-retirement-planning" as const,
      format: 1,
      id: "20260615T102030456Z-abcd1234",
      savedAt: "2026-06-15T10:20:30.456Z",
      deviceId: "abcd1234",
      deviceLabel: "Edge on Windows",
      parentId: null,
      ...sealed,
    };
    expect(await decryptPayload(stored as NonNullable<typeof stored>, envelope)).toEqual({ personal: { age: 50 } });
  });

  it("is dropped by disconnecting and by a reset", async () => {
    await saveSyncFolderConfig(base);
    await clearSyncFolderConfig();
    expect(await loadSyncFolderConfig()).toBeUndefined();

    await saveSyncFolderConfig(base);
    await clearAllData();
    expect(await loadSyncFolderConfig()).toBeUndefined();
  });

  it("does not appear from an update when no folder is connected", async () => {
    await updateSyncFolderConfig({ lastSyncedId: "x" });

    expect(await loadSyncFolderConfig()).toBeUndefined();
  });
});
