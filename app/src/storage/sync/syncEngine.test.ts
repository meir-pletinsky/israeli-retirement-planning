import { describe, expect, it } from "vitest";

import { createMemoryFolder } from "../../test/memoryFolder";
import { EMPTY_PROFILE } from "../../types";

import { deriveVaultKey } from "./snapshotCrypto";
import { backupPayload, openSnapshot, payloadFingerprint, pruneSnapshots, readHead, vaultOpens, writeSnapshot } from "./syncEngine";
import { snapshotFileName } from "./snapshotFile";

const DEVICE = { deviceId: "abcd1234-ef56", deviceLabel: "Edge on Windows" };
const PAYLOAD = { personal: { age: 50 } };

function request(overrides: Partial<Parameters<typeof writeSnapshot>[1]> = {}) {
  return { payload: PAYLOAD, vault: null, parentId: null, now: new Date("2026-06-15T10:00:00.000Z"), ...DEVICE, ...overrides };
}

describe("backup payload", () => {
  it("is the same for plans that differ only in how their objects were built", () => {
    const rebuilt = JSON.parse(JSON.stringify({ ...EMPTY_PROFILE, personal: { ...EMPTY_PROFILE.personal } }));
    const reversed = Object.fromEntries(Object.entries(rebuilt).reverse());

    expect(payloadFingerprint(backupPayload(EMPTY_PROFILE, null))).toBe(payloadFingerprint(reversed));
  });

  it("changes with the plan and with the What if draft", () => {
    const base = payloadFingerprint(backupPayload(EMPTY_PROFILE, null));

    expect(payloadFingerprint(backupPayload({ ...EMPTY_PROFILE, personal: { ...EMPTY_PROFILE.personal, age: 61 } }, null))).not.toBe(base);
    expect(payloadFingerprint(backupPayload(EMPTY_PROFILE, { overrides: { retirementAge: 62 } }))).not.toBe(base);
  });
});

describe("writing and reading backups", () => {
  it("finds nothing in an empty folder", async () => {
    expect(await readHead(createMemoryFolder())).toEqual({ head: null, unreadable: 0, newerFormat: false });
  });

  it("writes a plain backup that reads back as the newest", async () => {
    const folder = createMemoryFolder();

    const first = await writeSnapshot(folder, request());
    const second = await writeSnapshot(folder, request({ parentId: first.id, now: new Date("2026-06-15T10:05:00.000Z"), payload: { personal: { age: 51 } } }));
    const { head } = await readHead(folder);

    expect(head?.id).toBe(second.id);
    expect(head?.parentId).toBe(first.id);
    expect(head && (await openSnapshot(head, null))).toEqual({ personal: { age: 51 } });
    expect(folder.files.size).toBe(2);
  });

  it("writes a sealed backup that holds no readable plan, and opens only with the key", async () => {
    const folder = createMemoryFolder();
    const vault = await deriveVaultKey("correct horse", undefined, { iterations: 1000 });

    await writeSnapshot(folder, request({ vault }));
    const { head } = await readHead(folder);

    expect([...folder.files.values()][0]).not.toContain("personal");
    expect(head && vaultOpens(head, null)).toBe(false);
    expect(head && vaultOpens(head, vault)).toBe(true);
    await expect(openSnapshot(head!, null)).rejects.toMatchObject({ code: "passphraseNeeded" });
    expect(await openSnapshot(head!, vault)).toEqual(PAYLOAD);
  });

  it("puts a new backup after its parent even when this device's clock is behind", async () => {
    const folder = createMemoryFolder();
    const parent = await writeSnapshot(folder, request({ now: new Date("2026-06-15T10:00:00.000Z") }));

    const child = await writeSnapshot(folder, request({ parentId: parent.id, now: new Date("2026-06-15T09:00:00.000Z"), deviceId: "zzzz9999" }));

    expect(child.id > parent.id).toBe(true);
    expect((await readHead(folder)).head?.id).toBe(child.id);
  });

  it("passes over a newest file that is not readable yet and says so", async () => {
    const folder = createMemoryFolder();
    const good = await writeSnapshot(folder, request());
    folder.files.set(snapshotFileName("20260615T110000000Z-ffff0000"), '{"app":"israeli-retirement-planning","format":1,');

    const result = await readHead(folder);

    expect(result.head?.id).toBe(good.id);
    expect(result.unreadable).toBe(1);
    expect(result.newerFormat).toBe(false);
  });

  it("notices a backup written by a newer version of the app", async () => {
    const folder = createMemoryFolder();
    await writeSnapshot(folder, request());
    const newer = JSON.stringify({ app: "israeli-retirement-planning", format: 2 });
    folder.files.set(snapshotFileName("20260615T110000000Z-ffff0000"), newer);

    expect((await readHead(folder)).newerFormat).toBe(true);
  });

  it("ignores files in the folder that are not backups", async () => {
    const folder = createMemoryFolder();
    folder.files.set("holiday.jpg", "not json");

    expect(await readHead(folder)).toEqual({ head: null, unreadable: 0, newerFormat: false });
  });
});

describe("pruneSnapshots", () => {
  it("removes old backups and nothing else", async () => {
    const folder = createMemoryFolder();
    folder.files.set("holiday.jpg", "x");
    for (let i = 0; i < 25; i++) {
      const day = String(i + 1).padStart(2, "0");
      folder.files.set(snapshotFileName(`202604${day}T100000000Z-abcd1234`), "{}");
    }

    const removed = await pruneSnapshots(folder, new Date("2026-06-15T12:00:00Z"));

    expect(removed).toBe(5);
    expect(folder.files.has("holiday.jpg")).toBe(true);
    expect(folder.files.size).toBe(21);
  });
});
