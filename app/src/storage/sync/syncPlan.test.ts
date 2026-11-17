import { describe, expect, it } from "vitest";

import { planSync, type SyncSituation } from "./syncPlan";

const OLD = "20260601T100000000Z-aaaaaaaa";
const NEW = "20260610T100000000Z-bbbbbbbb";

function plan(overrides: Partial<SyncSituation>) {
  return planSync({ cloudHeadId: null, lastSyncedId: null, localHasData: true, localChanged: true, ...overrides });
}

describe("planSync", () => {
  it("saves a first backup when the folder is empty, but never an empty plan", () => {
    expect(plan({})).toEqual({ kind: "upload" });
    expect(plan({ localHasData: false })).toEqual({ kind: "idle" });
  });

  it("saves only what changed since this device last synced", () => {
    expect(plan({ cloudHeadId: NEW, lastSyncedId: NEW, localChanged: true })).toEqual({ kind: "upload" });
    expect(plan({ cloudHeadId: NEW, lastSyncedId: NEW, localChanged: false })).toEqual({ kind: "idle" });
    expect(plan({ cloudHeadId: NEW, lastSyncedId: NEW, localHasData: false })).toEqual({ kind: "idle" });
  });

  it("offers a newer backup to a device with nothing in it", () => {
    expect(plan({ cloudHeadId: NEW, localHasData: false, localChanged: false })).toEqual({
      kind: "offerLoad",
      deviceWasEmpty: true,
    });
  });

  it("offers a newer backup to a device that has not changed since it last synced", () => {
    expect(plan({ cloudHeadId: NEW, lastSyncedId: OLD, localChanged: false })).toEqual({
      kind: "offerLoad",
      deviceWasEmpty: false,
    });
  });

  it("asks which side wins when both changed", () => {
    expect(plan({ cloudHeadId: NEW, lastSyncedId: OLD, localChanged: true })).toEqual({ kind: "conflict" });
  });

  it("asks which side wins when a device with a plan meets a backup it never synced with", () => {
    expect(plan({ cloudHeadId: NEW, lastSyncedId: null })).toEqual({ kind: "conflict" });
  });

  it("saves again when the backup this device made has gone from the folder", () => {
    expect(plan({ cloudHeadId: OLD, lastSyncedId: NEW, localChanged: false })).toEqual({ kind: "upload" });
    expect(plan({ cloudHeadId: OLD, lastSyncedId: NEW, localHasData: false })).toEqual({ kind: "idle" });
  });
});
