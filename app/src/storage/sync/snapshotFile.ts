/**
 * The files the backup folder holds: one JSON file per saved state of the plan, never edited after it
 * is written. A new file for every save keeps a cloud client (OneDrive, Dropbox, ...) from making
 * "conflicted copy" files and leaves a history to go back to.
 */

export const SNAPSHOT_APP = "israeli-retirement-planning";

/** The version of the file layout below. A file with a higher one comes from a newer app and is not read. */
export const SNAPSHOT_FORMAT = 1;

/** The newest backups are always kept. */
export const KEEP_NEWEST_SNAPSHOTS = 20;

/** Beyond the newest ones, the last backup of each day is kept for this many days. */
export const KEEP_DAILY_SNAPSHOTS_FOR_DAYS = 30;

const FILE_PREFIX = "irp-backup-";
const FILE_SUFFIX = ".json";
const FILE_NAME_PATTERN = /^irp-backup-(\d{8}T\d{9}Z)-([A-Za-z0-9]{8})\.json$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EncryptionHeader {
  alg: "AES-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** Base64. Shared by every file written with the same passphrase, so another device can derive the same key. */
  salt: string;
  /** Base64. Different for every file. */
  iv: string;
}

export interface SnapshotMeta {
  /** Sorts by time: `<UTC time to the millisecond>-<first 8 characters of the device id>`. */
  id: string;
  /** ISO timestamp from the clock of the device that wrote the file. */
  savedAt: string;
  deviceId: string;
  /** What to call the device in a prompt, e.g. "Edge on Windows". */
  deviceLabel: string;
  /** The file this one was made from, so a second device can tell its copy is behind; null for the first. */
  parentId: string | null;
}

interface EnvelopeBase extends SnapshotMeta {
  app: typeof SNAPSHOT_APP;
  format: number;
}

export interface PlainSnapshot extends EnvelopeBase {
  encryption: null;
  /** What `buildExportObject` produces. */
  payload: Record<string, unknown>;
}

export interface EncryptedSnapshot extends EnvelopeBase {
  encryption: EncryptionHeader;
  /** Base64 of the encrypted JSON text of the payload. */
  data: string;
}

export type SnapshotEnvelope = PlainSnapshot | EncryptedSnapshot;

export type SnapshotErrorCode = "invalid" | "tooNew";

export class SnapshotError extends Error {
  readonly code: SnapshotErrorCode;

  constructor(code: SnapshotErrorCode, message: string) {
    super(message);
    this.name = "SnapshotError";
    this.code = code;
  }
}

/** The id of a backup written at `savedAt` by the given device. */
export function snapshotId(savedAt: Date, deviceId: string): string {
  const time = savedAt.toISOString().replace(/[-:.]/g, "");
  const device = deviceId.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).padEnd(8, "0");
  return `${time}-${device}`;
}

export function snapshotFileName(id: string): string {
  return `${FILE_PREFIX}${id}${FILE_SUFFIX}`;
}

/** The moment an id was made for. */
export function snapshotTime(id: string): Date {
  const [d, t] = [id.slice(0, 8), id.slice(9, 18)];
  return new Date(
    `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}.${t.slice(6, 9)}Z`,
  );
}

/** The id in a backup file's name, or null when the file is not one of ours. */
export function snapshotIdFromFileName(fileName: string): string | null {
  const match = FILE_NAME_PATTERN.exec(fileName);
  return match ? `${match[1]}-${match[2]}` : null;
}

/** The backup files among `fileNames`, newest first. */
export function listSnapshotIds(fileNames: readonly string[]): string[] {
  return fileNames
    .map(snapshotIdFromFileName)
    .filter((id): id is string => id !== null)
    .sort()
    .reverse();
}

function dayStart(id: string): number {
  return Date.UTC(Number(id.slice(0, 4)), Number(id.slice(4, 6)) - 1, Number(id.slice(6, 8)));
}

/**
 * The backups to delete: all but the newest {@link KEEP_NEWEST_SNAPSHOTS}, except that the last one
 * of each of the past {@link KEEP_DAILY_SNAPSHOTS_FOR_DAYS} days stays. Files that are not ours are never named.
 */
export function snapshotsToPrune(fileNames: readonly string[], now: Date): string[] {
  const ids = listSnapshotIds(fileNames);
  const kept = new Set(ids.slice(0, KEEP_NEWEST_SNAPSHOTS));
  const daysKept = new Set([...kept].map((id) => id.slice(0, 8)));
  const oldestDay = now.getTime() - KEEP_DAILY_SNAPSHOTS_FOR_DAYS * DAY_MS;

  for (const id of ids.slice(KEEP_NEWEST_SNAPSHOTS)) {
    const day = id.slice(0, 8);
    if (dayStart(id) >= oldestDay && !daysKept.has(day)) {
      kept.add(id);
      daysKept.add(day);
    }
  }
  return ids.filter((id) => !kept.has(id)).map(snapshotFileName);
}

export function serializeEnvelope(envelope: SnapshotEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEncryptionHeader(value: unknown): value is EncryptionHeader {
  return (
    isRecord(value) &&
    value.alg === "AES-GCM" &&
    value.kdf === "PBKDF2-SHA256" &&
    typeof value.iterations === "number" &&
    Number.isInteger(value.iterations) &&
    value.iterations > 0 &&
    typeof value.salt === "string" &&
    typeof value.iv === "string"
  );
}

/** Reads a backup file's text; throws a {@link SnapshotError} when it is not a readable backup of this app. */
export function parseEnvelope(text: string): SnapshotEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SnapshotError("invalid", "The backup file is not valid JSON.");
  }
  if (!isRecord(parsed) || parsed.app !== SNAPSHOT_APP || typeof parsed.format !== "number") {
    throw new SnapshotError("invalid", "This is not a backup file of this app.");
  }
  if (parsed.format > SNAPSHOT_FORMAT) {
    throw new SnapshotError("tooNew", "This backup was written by a newer version of the app.");
  }
  const { id, savedAt, deviceId, deviceLabel, parentId } = parsed;
  if (
    typeof id !== "string" ||
    snapshotIdFromFileName(snapshotFileName(id)) === null ||
    typeof savedAt !== "string" ||
    Number.isNaN(Date.parse(savedAt)) ||
    typeof deviceId !== "string" ||
    typeof deviceLabel !== "string" ||
    (parentId !== null && typeof parentId !== "string")
  ) {
    throw new SnapshotError("invalid", "The backup file's header is incomplete.");
  }
  const meta = { app: SNAPSHOT_APP, format: parsed.format, id, savedAt, deviceId, deviceLabel, parentId } as const;

  if (parsed.encryption === null) {
    if (!isRecord(parsed.payload)) throw new SnapshotError("invalid", "The backup file has no content.");
    return { ...meta, encryption: null, payload: parsed.payload };
  }
  if (!isEncryptionHeader(parsed.encryption) || typeof parsed.data !== "string") {
    throw new SnapshotError("invalid", "The backup file's encryption header is incomplete.");
  }
  return { ...meta, encryption: parsed.encryption, data: parsed.data };
}

/**
 * The text of a value with its object keys in alphabetical order, so two plans that are equal
 * produce the same text however their objects were built.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return inner;
    return Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/**
 * A short fingerprint of a text (cyrb53), to tell whether the plan changed since the last backup.
 * It only compares two states of the same plan; it is not a security measure.
 */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
