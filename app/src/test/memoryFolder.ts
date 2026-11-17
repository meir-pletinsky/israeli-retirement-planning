import { FolderError, type SyncFolder } from "../storage/sync/folderAccess";

export interface MemoryFolder extends SyncFolder {
  files: Map<string, string>;
  /** Make the next calls fail, as a folder the browser took back or that went missing would. */
  failWith: FolderError | null;
}

/** A backup folder kept in memory, for tests. */
export function createMemoryFolder(name = "Backups"): MemoryFolder {
  const files = new Map<string, string>();
  const folder: MemoryFolder = {
    name,
    files,
    failWith: null,
    async list() {
      if (folder.failWith) throw folder.failWith;
      return [...files.keys()];
    },
    async read(fileName) {
      if (folder.failWith) throw folder.failWith;
      const text = files.get(fileName);
      if (text === undefined) throw new FolderError("missing", `No file ${fileName}`);
      return text;
    },
    async write(fileName, text) {
      if (folder.failWith) throw folder.failWith;
      files.set(fileName, text);
    },
    async remove(fileName) {
      if (folder.failWith) throw folder.failWith;
      files.delete(fileName);
    },
  };
  return folder;
}
