import { beforeEach, describe, expect, it } from "vitest";

import { buildTestProfile } from "../test/domainFixtures";
import {
  clearAllData,
  clearBeforeImportRestorePoint,
  loadBeforeImportRestorePoint,
  saveBeforeImportRestorePoint,
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
