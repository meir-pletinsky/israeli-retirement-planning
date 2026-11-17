import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  fingerprint,
  listSnapshotIds,
  parseEnvelope,
  serializeEnvelope,
  snapshotFileName,
  snapshotId,
  snapshotIdFromFileName,
  snapshotsToPrune,
  SnapshotError,
  type PlainSnapshot,
} from "./snapshotFile";

const DEVICE = "abcd1234-ef56-7890";

function plainSnapshot(overrides: Partial<PlainSnapshot> = {}): PlainSnapshot {
  const savedAt = new Date("2026-06-15T10:20:30.456Z");
  return {
    app: "israeli-retirement-planning",
    format: 1,
    id: snapshotId(savedAt, DEVICE),
    savedAt: savedAt.toISOString(),
    deviceId: DEVICE,
    deviceLabel: "Edge on Windows",
    parentId: null,
    encryption: null,
    payload: { personal: { age: 50 } },
    ...overrides,
  };
}

describe("snapshot ids and file names", () => {
  it("builds an id that sorts by time and names the device", () => {
    const earlier = snapshotId(new Date("2026-06-15T10:20:30.456Z"), DEVICE);
    const later = snapshotId(new Date("2026-06-15T10:20:30.457Z"), DEVICE);

    expect(earlier).toBe("20260615T102030456Z-abcd1234");
    expect(earlier < later).toBe(true);
  });

  it("round-trips an id through its file name", () => {
    const id = snapshotId(new Date("2026-06-15T10:20:30.456Z"), DEVICE);

    expect(snapshotFileName(id)).toBe("irp-backup-20260615T102030456Z-abcd1234.json");
    expect(snapshotIdFromFileName(snapshotFileName(id))).toBe(id);
  });

  it("ignores files that are not ours", () => {
    expect(snapshotIdFromFileName("notes.txt")).toBeNull();
    expect(snapshotIdFromFileName("irp-backup-latest.json")).toBeNull();
    expect(snapshotIdFromFileName("irp-backup-20260615T102030456Z-abcd1234 (1).json")).toBeNull();
  });

  it("lists the backups newest first and skips other files", () => {
    const names = [
      "irp-backup-20260101T000000000Z-abcd1234.json",
      "desktop.ini",
      "irp-backup-20260301T000000000Z-abcd1234.json",
    ];

    expect(listSnapshotIds(names)).toEqual(["20260301T000000000Z-abcd1234", "20260101T000000000Z-abcd1234"]);
  });
});

describe("snapshotsToPrune", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const nameAt = (iso: string) => snapshotFileName(snapshotId(new Date(iso), DEVICE));

  it("deletes nothing while there are few backups", () => {
    const names = [nameAt("2026-06-15T10:00:00Z"), nameAt("2026-06-14T10:00:00Z")];

    expect(snapshotsToPrune(names, now)).toEqual([]);
  });

  it("keeps the newest 20, and the last backup of each recent day beyond them", () => {
    const recentSameDay = Array.from({ length: 22 }, (_, i) => nameAt(`2026-06-15T${String(i).padStart(2, "0")}:00:00Z`));
    const olderDayEarly = nameAt("2026-06-01T08:00:00Z");
    const olderDayLate = nameAt("2026-06-01T20:00:00Z");
    const tooOld = nameAt("2026-04-01T20:00:00Z");

    const pruned = snapshotsToPrune([...recentSameDay, olderDayEarly, olderDayLate, tooOld], now);

    expect(pruned).toContain(recentSameDay[0]);
    expect(pruned).toContain(recentSameDay[1]);
    expect(pruned).toContain(olderDayEarly);
    expect(pruned).toContain(tooOld);
    expect(pruned).not.toContain(olderDayLate);
    expect(pruned).toHaveLength(4);
  });

  it("never names a file that is not ours", () => {
    const names = [...Array.from({ length: 25 }, (_, i) => nameAt(`2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`)), "photo.jpg"];

    expect(snapshotsToPrune(names, now)).not.toContain("photo.jpg");
  });
});

describe("envelope files", () => {
  it("reads back a plain backup", () => {
    const envelope = plainSnapshot();

    expect(parseEnvelope(serializeEnvelope(envelope))).toEqual(envelope);
  });

  it("reads back an encrypted backup", () => {
    const envelope = {
      ...plainSnapshot(),
      payload: undefined,
      encryption: { alg: "AES-GCM", kdf: "PBKDF2-SHA256", iterations: 600_000, salt: "c2FsdA==", iv: "aXY=" },
      data: "Y2lwaGVy",
    };

    const parsed = parseEnvelope(JSON.stringify(envelope));

    expect(parsed.encryption?.iterations).toBe(600_000);
    expect("data" in parsed && parsed.data).toBe("Y2lwaGVy");
  });

  it("rejects what is not a backup of this app", () => {
    expect(() => parseEnvelope("not json")).toThrow(SnapshotError);
    expect(() => parseEnvelope(JSON.stringify({ personal: { age: 50 } }))).toThrow(SnapshotError);
    expect(() => parseEnvelope(JSON.stringify({ ...plainSnapshot(), id: "nonsense" }))).toThrow(SnapshotError);
    expect(() => parseEnvelope(JSON.stringify({ ...plainSnapshot(), payload: null }))).toThrow(SnapshotError);
  });

  it("tells a backup from a newer app apart from a broken one", () => {
    const attempt = () => parseEnvelope(JSON.stringify({ ...plainSnapshot(), format: 2 }));

    expect(attempt).toThrow(SnapshotError);
    try {
      attempt();
    } catch (error) {
      expect((error as SnapshotError).code).toBe("tooNew");
    }
  });
});

describe("fingerprint", () => {
  it("is stable and changes with the text", () => {
    expect(fingerprint('{"a":1}')).toBe(fingerprint('{"a":1}'));
    expect(fingerprint('{"a":1}')).not.toBe(fingerprint('{"a":2}'));
  });
});

describe("canonicalJson", () => {
  it("does not depend on the order objects were built in, at any depth", () => {
    const one = { b: 1, a: { y: [{ q: 1, p: 2 }], x: null } };
    const other = { a: { x: null, y: [{ p: 2, q: 1 }] }, b: 1 };

    expect(canonicalJson(one)).toBe(canonicalJson(other));
  });

  it("keeps the order of a list", () => {
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
  });
});
