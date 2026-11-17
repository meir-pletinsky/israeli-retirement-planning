import { vi } from "vitest";

import type { ChosenFolder, FolderSync } from "../app/folderSync";

/** A `FolderSync` for component tests: every action is a spy, and `overrides` set what the screen sees. */
export function fakeFolderSync(overrides: Partial<FolderSync> = {}): FolderSync {
  return {
    supported: true,
    status: "off",
    problem: null,
    permission: null,
    folderName: null,
    encrypted: false,
    lastSyncedAt: null,
    prompt: null,
    chooseFolder: vi.fn(async () => null),
    connectFolder: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    reconnect: vi.fn(async () => {}),
    syncNow: vi.fn(async () => {}),
    resolvePrompt: vi.fn(async () => "done" as const),
    reviewCloudVersion: vi.fn(),
    changeEncryption: vi.fn(async () => {}),
    ...overrides,
  };
}

/** A folder as the picker hands it over; by default an empty one. */
export function chosenFolder(overrides: Partial<ChosenFolder> = {}): ChosenFolder {
  return {
    handle: { kind: "directory", name: "Backups" } as unknown as FileSystemDirectoryHandle,
    name: "Backups",
    head: null,
    unreadable: 0,
    newerFormat: false,
    ...overrides,
  };
}
