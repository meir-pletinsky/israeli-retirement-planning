/**
 * The backup folder as the rest of the app sees it: a flat list of text files. The folder is one the
 * user picked, often one that OneDrive, Dropbox or a similar app keeps in sync; the browser asks for
 * access to it once and the choice can be remembered, see {@link requestFolderPermission}.
 */

export interface SyncFolder {
  /** What the user called the folder, for display. */
  name: string;
  /** The names of the files in the folder; sub-folders are left out. */
  list(): Promise<string[]>;
  read(fileName: string): Promise<string>;
  /** Writes the whole file, replacing one of the same name. */
  write(fileName: string, text: string): Promise<void>;
  /** Removes the file; no error when it is already gone. */
  remove(fileName: string): Promise<void>;
}

export type FolderPermission = "granted" | "prompt" | "denied";

export type FolderErrorCode =
  /** The browser no longer lets the app into the folder. */
  | "permission"
  /** The folder was moved, renamed or deleted. */
  | "missing"
  | "failed";

export class FolderError extends Error {
  readonly code: FolderErrorCode;

  constructor(code: FolderErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "FolderError";
    this.code = code;
  }
}

/** Whether this browser can keep a backup folder: Chrome, Edge and other Chromium browsers on a secure page. */
export function isFolderSyncSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showDirectoryPicker === "function" &&
    typeof FileSystemHandle !== "undefined" &&
    "queryPermission" in FileSystemHandle.prototype
  );
}

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
}

function toFolderError(error: unknown): FolderError {
  if (error instanceof FolderError) return error;
  const name = errorName(error);
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new FolderError("permission", "The browser no longer allows access to the backup folder.", { cause: error });
  }
  if (name === "NotFoundError") {
    return new FolderError("missing", "The backup folder or a file in it can't be found.", { cause: error });
  }
  return new FolderError("failed", "The backup folder could not be used.", { cause: error });
}

/** Lets the user pick the folder, with read and write access; null when they close the picker. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await window.showDirectoryPicker?.({ id: "irp-backup-folder", mode: "readwrite" })) ?? null;
  } catch (error) {
    if (errorName(error) === "AbortError") return null;
    throw toFolderError(error);
  }
}

/** Whether the app may use the folder right now, without asking. */
export async function queryFolderPermission(handle: FileSystemDirectoryHandle): Promise<FolderPermission> {
  try {
    return await handle.queryPermission({ mode: "readwrite" });
  } catch (error) {
    throw toFolderError(error);
  }
}

/**
 * Asks the browser for access to the folder. This has to be called from a click (or similar); Chrome
 * then offers "Allow on every visit", and when the user picks that, later visits are granted without asking.
 */
export async function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<FolderPermission> {
  try {
    return await handle.requestPermission({ mode: "readwrite" });
  } catch (error) {
    throw toFolderError(error);
  }
}

export function folderFromHandle(handle: FileSystemDirectoryHandle): SyncFolder {
  return {
    name: handle.name,
    async list() {
      try {
        const names: string[] = [];
        for await (const entry of handle.values()) {
          if (entry.kind === "file") names.push(entry.name);
        }
        return names;
      } catch (error) {
        throw toFolderError(error);
      }
    },
    async read(fileName) {
      try {
        const file = await (await handle.getFileHandle(fileName)).getFile();
        return await file.text();
      } catch (error) {
        throw toFolderError(error);
      }
    },
    async write(fileName, text) {
      try {
        const writable = await (await handle.getFileHandle(fileName, { create: true })).createWritable();
        try {
          await writable.write(text);
        } finally {
          await writable.close();
        }
      } catch (error) {
        throw toFolderError(error);
      }
    },
    async remove(fileName) {
      try {
        await handle.removeEntry(fileName);
      } catch (error) {
        if (errorName(error) !== "NotFoundError") throw toFolderError(error);
      }
    },
  };
}
