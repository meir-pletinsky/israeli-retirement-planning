import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAllData,
  loadBeforeImportRestorePoint,
  loadSyncFolderConfig,
  saveOnboardedToDb,
  saveProfileToDb,
  saveSyncFolderConfig,
} from "../storage/db";
import { FolderError, type FolderPermission } from "../storage/sync/folderAccess";
import { deriveVaultKey } from "../storage/sync/snapshotCrypto";
import { backupPayload, openSnapshot, readHead, writeSnapshot } from "../storage/sync/syncEngine";
import { createMemoryFolder, type MemoryFolder } from "../test/memoryFolder";
import { buildTestProfile } from "../test/domainFixtures";

import { useFolderSync } from "./folderSync";
import { FolderSyncProvider, type FolderSyncDeps, type FolderSyncTiming } from "./FolderSyncProvider";
import { ProfileProvider, useProfile } from "./ProfileContext";

const FAST: FolderSyncTiming = { uploadDelayMs: 20, minUploadIntervalMs: 0, recheckMinIntervalMs: 0 };
const ITERATIONS = 1000;
const PASSPHRASE = "correct horse battery";
const OLD_ID = "20260101T000000000Z-aaaaaaaa";

let folder: MemoryFolder;
let permission: FolderPermission;
let deps: FolderSyncDeps;
const handle = { kind: "directory", name: "Backups" } as unknown as FileSystemDirectoryHandle;

beforeEach(async () => {
  await clearAllData();
  folder = createMemoryFolder("Backups");
  permission = "granted";
  deps = {
    pickFolder: vi.fn(async () => handle),
    openFolder: vi.fn(() => folder),
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => {
      permission = "granted";
      return permission;
    }),
  };
});

async function seedPlan(age: number | null) {
  if (age === null) return;
  await saveProfileToDb(buildTestProfile({ age }));
  await saveOnboardedToDb(true);
}

async function seedConnection(overrides: Partial<Parameters<typeof saveSyncFolderConfig>[0]> = {}) {
  await saveSyncFolderConfig({
    handle,
    folderName: "Backups",
    deviceId: "local-device-1",
    deviceLabel: "Edge on Windows",
    vault: null,
    lastSyncedId: null,
    lastSyncedHash: null,
    lastSyncedAt: null,
    ...overrides,
  });
}

/** A backup another device left in the folder. */
async function seedCloudPlan(age: number, { sealed = false, at = "2026-06-15T10:00:00.000Z" } = {}) {
  const vault = sealed ? await deriveVaultKey(PASSPHRASE, undefined, { iterations: ITERATIONS }) : null;
  return writeSnapshot(folder, {
    payload: backupPayload(buildTestProfile({ age }), null),
    vault,
    deviceId: "other-device-1",
    deviceLabel: "Chrome on Android",
    parentId: null,
    now: new Date(at),
  });
}

function Probe() {
  const sync = useFolderSync();
  const { profile, updateProfile } = useProfile();
  const [outcome, setOutcome] = useState("");

  const run = (action: () => Promise<unknown>) => () => {
    setOutcome("");
    action().then(
      (result) => setOutcome(typeof result === "string" ? result : "done"),
      (error: unknown) => setOutcome(error instanceof Error && "code" in error ? String(error.code) : "failed"),
    );
  };
  const connectWith = (passphrase: string | null) =>
    run(async () => {
      const chosen = await sync.chooseFolder();
      if (chosen) await sync.connectFolder(chosen, passphrase);
    });
  const { prompt } = sync;

  return (
    <>
      <output data-testid="status">{sync.status}</output>
      <output data-testid="problem">{sync.problem ?? ""}</output>
      <output data-testid="folder">{sync.folderName ?? ""}</output>
      <output data-testid="encrypted">{String(sync.encrypted)}</output>
      <output data-testid="age">{profile.personal.age ?? ""}</output>
      <output data-testid="outcome">{outcome}</output>
      <output data-testid="prompt">
        {prompt ? `${prompt.kind}:${prompt.deviceWasEmpty ? "empty" : "has data"}:${prompt.needsPassphrase ? "locked" : "open"}` : ""}
      </output>
      <button onClick={() => updateProfile({ personal: { ...profile.personal, age: (profile.personal.age ?? 0) + 1 } })}>edit</button>
      <button onClick={connectWith(null)}>connect plain</button>
      <button onClick={connectWith(PASSPHRASE)}>connect sealed</button>
      <button onClick={connectWith("short")}>connect short</button>
      <button onClick={connectWith("not the passphrase")}>connect wrong</button>
      <button onClick={run(() => sync.resolvePrompt("useCloud"))}>use cloud</button>
      <button onClick={run(() => sync.resolvePrompt("useCloud", "not the passphrase"))}>use cloud wrong</button>
      <button onClick={run(() => sync.resolvePrompt("useCloud", PASSPHRASE))}>use cloud right</button>
      <button onClick={run(() => sync.resolvePrompt("keepLocal"))}>keep mine</button>
      <button onClick={run(() => sync.resolvePrompt("later"))}>later</button>
      <button onClick={run(sync.reconnect)}>reconnect</button>
      <button onClick={run(sync.disconnect)}>disconnect</button>
      <button onClick={run(sync.syncNow)}>sync now</button>
      <button onClick={() => sync.reviewCloudVersion()}>review</button>
      <button onClick={run(() => sync.changeEncryption(PASSPHRASE))}>seal</button>
      <button onClick={run(() => sync.changeEncryption(null))}>unseal</button>
    </>
  );
}

async function mount({ supported = true } = {}) {
  render(
    <ProfileProvider>
      <FolderSyncProvider deps={deps} timing={FAST} kdfIterations={ITERATIONS} supported={supported}>
        <Probe />
      </FolderSyncProvider>
    </ProfileProvider>,
  );
  await screen.findByTestId("status");
  return userEvent.setup();
}

const status = () => screen.getByTestId("status").textContent;
const outcome = () => screen.getByTestId("outcome").textContent;
const age = () => screen.getByTestId("age").textContent;

describe("a connected folder", () => {
  it("is not used in a browser that cannot keep one", async () => {
    await mount({ supported: false });

    expect(status()).toBe("unsupported");
  });

  it("is off until the user connects one", async () => {
    await seedPlan(55);
    await mount();

    await waitFor(() => expect(status()).toBe("off"));
    expect(folder.files.size).toBe(0);
  });

  it("gets the plan saved into an empty folder", async () => {
    await seedPlan(55);
    await seedConnection();
    await mount();

    await waitFor(() => expect(folder.files.size).toBe(1));
    await waitFor(() => expect(status()).toBe("synced"));
    const { head } = await readHead(folder);
    expect(head && (await openSnapshot(head, null)).personal).toMatchObject({ age: 55 });
    expect(head?.deviceLabel).toBe("Edge on Windows");
    expect((await loadSyncFolderConfig())?.lastSyncedId).toBe(head?.id);
  });

  it("saves a change a little after it is made, as a new backup", async () => {
    await seedPlan(55);
    await seedConnection();
    const user = await mount();
    await waitFor(() => expect(status()).toBe("synced"));

    await user.click(screen.getByRole("button", { name: "edit" }));

    await waitFor(() => expect(folder.files.size).toBe(2));
    await waitFor(() => expect(status()).toBe("synced"));
    const { head } = await readHead(folder);
    expect(head && (await openSnapshot(head, null)).personal).toMatchObject({ age: 56 });
  });

  it("does not save an empty plan over what the folder holds", async () => {
    const cloud = await seedCloudPlan(61);
    await seedConnection({ lastSyncedId: cloud.id, lastSyncedHash: "x" });
    await mount();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(folder.files.size).toBe(1);
    expect(status()).toBe("synced");
    expect(screen.getByTestId("prompt")).toHaveTextContent("");
  });
});

describe("connecting a folder", () => {
  it("saves the plan in plain text when no passphrase is given", async () => {
    await seedPlan(55);
    const user = await mount();
    await waitFor(() => expect(status()).toBe("off"));

    await user.click(screen.getByRole("button", { name: "connect plain" }));

    await waitFor(() => expect(status()).toBe("synced"));
    expect(screen.getByTestId("folder")).toHaveTextContent("Backups");
    expect(screen.getByTestId("encrypted")).toHaveTextContent("false");
    expect([...folder.files.values()][0]).toContain('"age"');
  });

  it("seals the backups when given a passphrase", async () => {
    await seedPlan(55);
    const user = await mount();
    await waitFor(() => expect(status()).toBe("off"));

    await user.click(screen.getByRole("button", { name: "connect sealed" }));

    await waitFor(() => expect(status()).toBe("synced"));
    expect(screen.getByTestId("encrypted")).toHaveTextContent("true");
    expect([...folder.files.values()][0]).not.toContain('"age"');
  });

  it("refuses a short passphrase", async () => {
    const user = await mount();
    await waitFor(() => expect(status()).toBe("off"));

    await user.click(screen.getByRole("button", { name: "connect short" }));

    await waitFor(() => expect(outcome()).toBe("invalid"));
    expect(status()).toBe("off");
  });

  it("needs the folder's own passphrase when its backups are sealed", async () => {
    await seedCloudPlan(61, { sealed: true });
    const user = await mount();
    await waitFor(() => expect(status()).toBe("off"));

    await user.click(screen.getByRole("button", { name: "connect wrong" }));
    await waitFor(() => expect(outcome()).toBe("wrongPassphrase"));
    expect(status()).toBe("off");

    await user.click(screen.getByRole("button", { name: "connect sealed" }));
    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("load:empty:open"));
    expect(screen.getByTestId("encrypted")).toHaveTextContent("true");
  });

  it("can be undone, leaving the backups where they are", async () => {
    await seedPlan(55);
    const user = await mount();
    await user.click(screen.getByRole("button", { name: "connect plain" }));
    await waitFor(() => expect(status()).toBe("synced"));

    await user.click(screen.getByRole("button", { name: "disconnect" }));

    await waitFor(() => expect(status()).toBe("off"));
    expect(await loadSyncFolderConfig()).toBeUndefined();
    expect(folder.files.size).toBe(1);
  });
});

describe("when the folder holds a different plan", () => {
  it("offers a device with nothing the folder's plan, and takes it when asked", async () => {
    const cloud = await seedCloudPlan(61);
    await seedConnection();
    const user = await mount();

    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("load:empty:open"));
    expect(status()).toBe("paused");
    await user.click(screen.getByRole("button", { name: "use cloud" }));

    await waitFor(() => expect(age()).toBe("61"));
    await waitFor(() => expect(status()).toBe("synced"));
    expect(screen.getByTestId("prompt")).toHaveTextContent("");
    expect((await loadSyncFolderConfig())?.lastSyncedId).toBe(cloud.id);
    expect(folder.files.size).toBe(1);
  });

  it("asks when both sides changed, and saves a restore point before taking the folder's plan", async () => {
    const cloud = await seedCloudPlan(61);
    await seedPlan(55);
    await seedConnection({ lastSyncedId: OLD_ID, lastSyncedHash: "stale" });
    const user = await mount();

    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("conflict:has data:open"));
    await user.click(screen.getByRole("button", { name: "use cloud" }));

    await waitFor(() => expect(age()).toBe("61"));
    expect((await loadBeforeImportRestorePoint())?.data.personal.age).toBe(55);
    expect((await loadSyncFolderConfig())?.lastSyncedId).toBe(cloud.id);
  });

  it("keeps this device's plan when asked, saving it as the next backup", async () => {
    const cloud = await seedCloudPlan(61);
    await seedPlan(55);
    await seedConnection({ lastSyncedId: OLD_ID, lastSyncedHash: "stale" });
    const user = await mount();
    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("conflict"));

    await user.click(screen.getByRole("button", { name: "keep mine" }));

    await waitFor(() => expect(folder.files.size).toBe(2));
    const { head } = await readHead(folder);
    expect(head?.parentId).toBe(cloud.id);
    expect(head && (await openSnapshot(head, null)).personal).toMatchObject({ age: 55 });
    expect(age()).toBe("55");
    await waitFor(() => expect(status()).toBe("synced"));
  });

  it("saves nothing while the user puts it off, and asks again when reviewed", async () => {
    await seedCloudPlan(61);
    await seedPlan(55);
    await seedConnection({ lastSyncedId: OLD_ID, lastSyncedHash: "stale" });
    const user = await mount();
    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("conflict"));

    await user.click(screen.getByRole("button", { name: "later" }));
    await user.click(screen.getByRole("button", { name: "edit" }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(status()).toBe("paused");
    expect(screen.getByTestId("prompt")).toHaveTextContent("");
    expect(folder.files.size).toBe(1);

    await user.click(screen.getByRole("button", { name: "review" }));
    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("conflict"));
  });

  it("needs the passphrase to take a sealed backup, and says when it is wrong", async () => {
    await seedCloudPlan(61, { sealed: true });
    await seedConnection();
    const user = await mount();
    await waitFor(() => expect(screen.getByTestId("prompt")).toHaveTextContent("load:empty:locked"));

    await user.click(screen.getByRole("button", { name: "use cloud wrong" }));
    await waitFor(() => expect(outcome()).toBe("wrongPassphrase"));
    expect(age()).not.toBe("61");

    await user.click(screen.getByRole("button", { name: "use cloud right" }));
    await waitFor(() => expect(age()).toBe("61"));
    await waitFor(() => expect(screen.getByTestId("encrypted")).toHaveTextContent("true"));
  });
});

describe("when the browser or the folder gets in the way", () => {
  it("waits for the user to allow the folder again, then catches up", async () => {
    await seedPlan(55);
    await seedConnection();
    permission = "prompt";
    const user = await mount();

    await waitFor(() => expect(status()).toBe("needsPermission"));
    expect(folder.files.size).toBe(0);

    await user.click(screen.getByRole("button", { name: "reconnect" }));

    await waitFor(() => expect(status()).toBe("synced"));
    expect(deps.requestPermission).toHaveBeenCalledTimes(1);
    expect(folder.files.size).toBe(1);
  });

  it("reports a folder that is gone", async () => {
    await seedPlan(55);
    await seedConnection();
    folder.failWith = new FolderError("missing", "The folder was deleted.");
    await mount();

    await waitFor(() => expect(status()).toBe("error"));
    expect(screen.getByTestId("problem")).toHaveTextContent("missing");
  });

  it("does not save over a backup from a newer version of the app", async () => {
    await seedPlan(55);
    await seedConnection();
    folder.files.set(
      "irp-backup-20260615T100000000Z-otherdev.json",
      JSON.stringify({ app: "israeli-retirement-planning", format: 999 }),
    );
    await mount();

    await waitFor(() => expect(status()).toBe("error"));
    expect(screen.getByTestId("problem")).toHaveTextContent("newerFormat");
    expect(folder.files.size).toBe(1);
  });
});

describe("changing how backups are sealed", () => {
  it("saves the plan again, sealed, and then in plain text again", async () => {
    await seedPlan(55);
    await seedConnection();
    const user = await mount();
    await waitFor(() => expect(folder.files.size).toBe(1));
    await waitFor(() => expect(status()).toBe("synced"));

    await user.click(screen.getByRole("button", { name: "seal" }));
    await waitFor(() => expect(folder.files.size).toBe(2));
    await waitFor(() => expect(screen.getByTestId("encrypted")).toHaveTextContent("true"));
    const sealed = await readHead(folder);
    expect(sealed.head?.encryption).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "unseal" }));
    await waitFor(() => expect(folder.files.size).toBe(3));
    await waitFor(() => expect(screen.getByTestId("encrypted")).toHaveTextContent("false"));
    expect((await readHead(folder)).head?.encryption).toBeNull();
  });
});
