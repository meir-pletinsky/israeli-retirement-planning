import { describe, expect, it } from "vitest";

import { FolderError, folderFromHandle, pickFolder } from "./folderAccess";

function domError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

/** A directory handle holding the given files and sub-folders. */
function fakeHandle(files: Record<string, string>, folders: string[] = []) {
  const store = new Map(Object.entries(files));
  const handle = {
    name: "Backups",
    kind: "directory",
    async *values() {
      for (const name of store.keys()) yield { kind: "file", name };
      for (const name of folders) yield { kind: "directory", name };
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!store.has(name) && !options?.create) throw domError("NotFoundError");
      return {
        getFile: async () => new File([store.get(name) ?? ""], name),
        createWritable: async () => {
          let text = "";
          return {
            write: async (chunk: string) => {
              text += chunk;
            },
            close: async () => {
              store.set(name, text);
            },
          };
        },
      };
    },
    async removeEntry(name: string) {
      if (!store.delete(name)) throw domError("NotFoundError");
    },
  };
  return { handle: handle as unknown as FileSystemDirectoryHandle, store };
}

describe("folderFromHandle", () => {
  it("lists files and leaves sub-folders out", async () => {
    const { handle } = fakeHandle({ "a.json": "1", "b.json": "2" }, ["old"]);

    expect(await folderFromHandle(handle).list()).toEqual(["a.json", "b.json"]);
  });

  it("writes a file, reads it back and removes it", async () => {
    const { handle, store } = fakeHandle({});
    const folder = folderFromHandle(handle);

    await folder.write("a.json", '{"x":1}');
    expect(await folder.read("a.json")).toBe('{"x":1}');

    await folder.remove("a.json");
    expect(store.has("a.json")).toBe(false);
  });

  it("does not mind removing a file that is already gone", async () => {
    const { handle } = fakeHandle({});

    await expect(folderFromHandle(handle).remove("gone.json")).resolves.toBeUndefined();
  });

  it("tells a missing file or folder from a folder the browser took back", async () => {
    const { handle } = fakeHandle({});
    const folder = folderFromHandle(handle);
    await expect(folder.read("nope.json")).rejects.toMatchObject({ code: "missing" });

    const denied = {
      name: "Backups",
      values: () => {
        throw domError("NotAllowedError");
      },
    } as unknown as FileSystemDirectoryHandle;
    const attempt = folderFromHandle(denied).list();
    await expect(attempt).rejects.toBeInstanceOf(FolderError);
    await expect(attempt).rejects.toMatchObject({ code: "permission" });
  });
});

describe("pickFolder", () => {
  it("gives null when the user closes the picker", async () => {
    window.showDirectoryPicker = async () => {
      throw domError("AbortError");
    };

    expect(await pickFolder()).toBeNull();

    delete window.showDirectoryPicker;
  });

  it("asks for read and write access", async () => {
    const { handle } = fakeHandle({});
    let asked: unknown;
    window.showDirectoryPicker = async (options) => {
      asked = options;
      return handle;
    };

    expect(await pickFolder()).toBe(handle);
    expect(asked).toMatchObject({ mode: "readwrite" });

    delete window.showDirectoryPicker;
  });
});
