import { beforeEach, describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  clearAllData,
  clearBeforeImportRestorePoint,
  loadBackupSnoozedUntilFromDb,
  loadBeforeImportRestorePoint,
  loadCpiLookupEnabledFromDb,
  loadFxLookupEnabledFromDb,
  loadLastExportedAtFromDb,
  loadOnboardedFromDb,
  saveBackupSnoozedUntilToDb,
  saveBeforeImportRestorePoint,
  saveCpiLookupEnabledToDb,
  saveFxLookupEnabledToDb,
  saveLastExportedAtToDb,
  saveOnboardedToDb,
} from "./db";

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
