/**
 * Reading and writing backups in the backup folder, on top of {@link SyncFolder}. It knows nothing of
 * React or of when to sync; see syncPlan for what to do and the provider for when.
 */

import { buildExportObject } from "../profileIO";
import type { ProfileData } from "../../types";

import type { SyncFolder } from "./folderAccess";
import {
  decryptPayload,
  encryptPayload,
  SnapshotCryptoError,
  vaultFits,
  type VaultKey,
} from "./snapshotCrypto";
import {
  SNAPSHOT_APP,
  SNAPSHOT_FORMAT,
  SnapshotError,
  canonicalJson,
  fingerprint,
  listSnapshotIds,
  parseEnvelope,
  serializeEnvelope,
  snapshotFileName,
  snapshotId,
  snapshotsToPrune,
  snapshotTime,
  type SnapshotEnvelope,
  type SnapshotMeta,
} from "./snapshotFile";

/** How many of the newest files are looked at to find one that can be read, before giving up on the folder. */
const HEAD_CANDIDATES = 5;

/** What goes into a backup for the plan and the What if draft as they are now. */
export function backupPayload(profile: ProfileData, whatIfDraft: object | null): Record<string, unknown> {
  return buildExportObject(profile, whatIfDraft);
}

/** Fingerprint of a payload, to tell whether the plan changed since the last backup. */
export function payloadFingerprint(payload: Record<string, unknown>): string {
  return fingerprint(canonicalJson(payload));
}

export interface FolderHead {
  /** The newest backup that could be read, or null when the folder has none. */
  head: SnapshotEnvelope | null;
  /** Newer files that could not be read, usually because a cloud app has not finished copying them. */
  unreadable: number;
  /** A newer file was written by a newer version of this app, so this one should not save over it. */
  newerFormat: boolean;
}

/** Finds the newest backup in the folder. */
export async function readHead(folder: SyncFolder): Promise<FolderHead> {
  const ids = listSnapshotIds(await folder.list()).slice(0, HEAD_CANDIDATES);
  let unreadable = 0;
  let newerFormat = false;

  for (const id of ids) {
    try {
      const head = parseEnvelope(await folder.read(snapshotFileName(id)));
      return { head, unreadable, newerFormat };
    } catch (error) {
      if (error instanceof SnapshotError && error.code === "tooNew") newerFormat = true;
      else if (!(error instanceof SnapshotError)) throw error;
      unreadable += 1;
    }
  }
  return { head: null, unreadable, newerFormat };
}

/** The plan inside a backup; throws a {@link SnapshotCryptoError} when it is sealed and the key is missing or wrong. */
export async function openSnapshot(
  envelope: SnapshotEnvelope,
  vault: VaultKey | null,
): Promise<Record<string, unknown>> {
  if (envelope.encryption === null) return envelope.payload;
  if (!vault) throw new SnapshotCryptoError("passphraseNeeded", "This backup is sealed with a passphrase.");
  return decryptPayload(vault, envelope);
}

/** Whether `vault` can be tried on the backup; a backup that is not sealed needs no key. */
export function vaultOpens(envelope: SnapshotEnvelope, vault: VaultKey | null): boolean {
  return envelope.encryption === null || (vault !== null && vaultFits(vault, envelope.encryption));
}

export interface WriteRequest {
  payload: Record<string, unknown>;
  /** Seals the backup; null writes it as plain text. */
  vault: VaultKey | null;
  deviceId: string;
  deviceLabel: string;
  /** The backup this one replaces as the newest, or null for the first. */
  parentId: string | null;
  now: Date;
}

/** Saves a new backup file and checks that it can be read back. */
export async function writeSnapshot(folder: SyncFolder, request: WriteRequest): Promise<SnapshotMeta> {
  const { payload, vault, deviceId, deviceLabel, parentId } = request;

  // A clock that runs behind the one of the device that wrote the parent must not put the new file before it.
  let savedAt = request.now;
  let id = snapshotId(savedAt, deviceId);
  if (parentId !== null && id <= parentId) {
    savedAt = new Date(snapshotTime(parentId).getTime() + 1);
    id = snapshotId(savedAt, deviceId);
  }

  const meta: SnapshotMeta = { id, savedAt: savedAt.toISOString(), deviceId, deviceLabel, parentId };
  const common = { app: SNAPSHOT_APP, format: SNAPSHOT_FORMAT, ...meta } as const;
  const envelope: SnapshotEnvelope = vault
    ? { ...common, ...(await encryptPayload(vault, id, payload)) }
    : { ...common, encryption: null, payload };

  const fileName = snapshotFileName(id);
  await folder.write(fileName, serializeEnvelope(envelope));

  const written = parseEnvelope(await folder.read(fileName));
  if (written.id !== id) throw new SnapshotError("invalid", "The backup that was saved could not be read back.");
  return meta;
}

/** Deletes the backups the retention rule no longer keeps; returns how many it removed. */
export async function pruneSnapshots(folder: SyncFolder, now: Date): Promise<number> {
  const doomed = snapshotsToPrune(await folder.list(), now);
  let removed = 0;
  for (const fileName of doomed) {
    try {
      await folder.remove(fileName);
      removed += 1;
    } catch {
      // A file that can't be removed now is tried again at the next pruning.
    }
  }
  return removed;
}
