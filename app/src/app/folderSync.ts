import { createContext, useContext } from "react";

import type { FolderPermission } from "../storage/sync/folderAccess";
import type { SnapshotEnvelope } from "../storage/sync/snapshotFile";

/**
 * Where the backup folder stands, for the screens that show it:
 * - `unsupported`: this browser can't keep a backup folder.
 * - `off`: no folder is connected.
 * - `needsPermission`: the browser wants a click before the app may use the folder again.
 * - `checking` / `saving`: talking to the folder.
 * - `synced`: the folder holds the latest plan. `pending`: changes are waiting to be saved there.
 * - `paused`: the folder and this device differ and the user has not chosen yet; nothing is saved.
 * - `error`: see `problem`.
 */
export type FolderSyncStatus =
  | "unsupported"
  | "off"
  | "needsPermission"
  | "checking"
  | "saving"
  | "synced"
  | "pending"
  | "paused"
  | "error";

export type FolderSyncProblem =
  /** The browser took back access to the folder. */
  | "permission"
  /** The folder or what is in it is gone. */
  | "missing"
  | "failed"
  /** A backup in the folder was written by a newer version of the app. */
  | "newerFormat"
  /** The newest files in the folder can't be read yet, e.g. a cloud app is still copying them. */
  | "unreadable";

/** The backup in the folder that this device has not got. */
export interface CloudVersion {
  id: string;
  savedAt: string;
  /** The device that saved it, e.g. "Chrome on Android". */
  deviceLabel: string;
  encrypted: boolean;
}

/** The question the user is asked when the folder and this device differ. */
export interface SyncPrompt {
  /** `load`: only the folder has changes. `conflict`: both sides have. */
  kind: "load" | "conflict";
  /** This device holds no plan yet. */
  deviceWasEmpty: boolean;
  cloud: CloudVersion;
  /** The backup is sealed and this device does not have the key, so the passphrase is needed to use it. */
  needsPassphrase: boolean;
}

export type PromptChoice = "useCloud" | "keepLocal" | "later";

export type PromptOutcome = "done" | "wrongPassphrase" | "failed";

/** A folder the user picked, before it is connected. */
export interface ChosenFolder {
  handle: FileSystemDirectoryHandle;
  name: string;
  /** The newest backup already in the folder, or null when there is none. */
  head: SnapshotEnvelope | null;
  /** Files that look like backups but can't be read yet. */
  unreadable: number;
  /** The folder holds a backup written by a newer version of the app. */
  newerFormat: boolean;
}

export interface FolderSync {
  supported: boolean;
  status: FolderSyncStatus;
  problem: FolderSyncProblem | null;
  /** What the browser says about access to the folder, while `status` is `needsPermission`. */
  permission: FolderPermission | null;
  folderName: string | null;
  /** The backups are sealed with a passphrase. */
  encrypted: boolean;
  /** ISO timestamp of the last time the folder and this device were made equal, or null. */
  lastSyncedAt: string | null;
  prompt: SyncPrompt | null;

  /** Opens the browser's folder picker; call it straight from a click. Null when the user closes the picker. */
  chooseFolder: () => Promise<ChosenFolder | null>;
  /**
   * Connects the picked folder. The passphrase seals the backups; null keeps them as plain text.
   * When the folder already holds sealed backups it must be theirs. Rejects with a
   * `SnapshotCryptoError` whose code is `wrongPassphrase` when it is not.
   */
  connectFolder: (chosen: ChosenFolder, passphrase: string | null) => Promise<void>;
  /** Stops using the folder; the backups in it stay where they are. */
  disconnect: () => Promise<void>;
  /** Asks the browser to let the app use the folder again; call it straight from a click. */
  reconnect: () => Promise<void>;
  /** Looks at the folder now and saves what changed, without waiting. */
  syncNow: () => Promise<void>;
  resolvePrompt: (choice: PromptChoice, passphrase?: string) => Promise<PromptOutcome>;
  /** Asks again about a backup the user put off. */
  reviewCloudVersion: () => void;
  /** Seals later backups with a new passphrase, or null to write them as plain text. */
  changeEncryption: (passphrase: string | null) => Promise<void>;
}

const UNAVAILABLE: FolderSync = {
  supported: false,
  status: "unsupported",
  problem: null,
  permission: null,
  folderName: null,
  encrypted: false,
  lastSyncedAt: null,
  prompt: null,
  chooseFolder: async () => null,
  connectFolder: async () => {},
  disconnect: async () => {},
  reconnect: async () => {},
  syncNow: async () => {},
  resolvePrompt: async () => "done",
  reviewCloudVersion: () => {},
  changeEncryption: async () => {},
};

export const FolderSyncContext = createContext<FolderSync>(UNAVAILABLE);

export function useFolderSync(): FolderSync {
  return useContext(FolderSyncContext);
}

/** The shortest passphrase the setup accepts. */
export const MIN_PASSPHRASE_LENGTH = 8;

/** The browser's own wording for the permission choice; deliberately not translated, since the prompt follows the browser's language. */
export const ALWAYS_ALLOW_OPTION = "\u2066Allow on every visit\u2069";

/** What is wrong with a passphrase being chosen, or null when it can be used. */
export function passphraseProblem(passphrase: string, confirmation: string): "short" | "mismatch" | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return "short";
  return passphrase === confirmation ? null : "mismatch";
}

/** Whether the status is one in which the folder is in use and nothing needs the user. */
export function isFolderInSync(status: FolderSyncStatus): boolean {
  return status === "synced" || status === "pending" || status === "saving" || status === "checking";
}
