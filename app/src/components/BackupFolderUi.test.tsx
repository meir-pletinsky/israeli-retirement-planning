import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { FolderSyncContext, type FolderSync, type SyncPrompt } from "../app/folderSync";
import "../i18n";
import { SnapshotCryptoError } from "../storage/sync/snapshotCrypto";
import type { SnapshotEnvelope } from "../storage/sync/snapshotFile";
import { chosenFolder, fakeFolderSync } from "../test/fakeFolderSync";
import { BackupFolderCard } from "./BackupFolderCard";
import { BackupFolderNotice } from "./BackupFolderNotice";
import { SyncPromptDialog } from "./SyncPromptDialog";

function renderWith(sync: FolderSync, ui: ReactElement, route = "/dashboard") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <FolderSyncContext.Provider value={sync}>{ui}</FolderSyncContext.Provider>
    </MemoryRouter>,
  );
}

const SEALED_HEAD = {
  app: "israeli-retirement-planning",
  format: 1,
  id: "20260615T100000000Z-aaaaaaaa",
  savedAt: "2026-06-15T10:00:00.000Z",
  deviceId: "other-device",
  deviceLabel: "Chrome on Android",
  parentId: null,
  encryption: { alg: "AES-GCM", kdf: "PBKDF2-SHA256", iterations: 1000, salt: "AAAA", iv: "AAAA" },
  data: "AAAA",
} as unknown as SnapshotEnvelope;

const PASSPHRASE = "correct horse battery";

describe("BackupFolderCard", () => {
  it("says what the browser needs when it cannot keep a folder", () => {
    renderWith(fakeFolderSync({ supported: false, status: "unsupported" }), <BackupFolderCard />);

    expect(screen.getByText(/works in Chrome and Edge on a computer/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("connects a new folder sealed with a passphrase by default", async () => {
    const user = userEvent.setup();
    const chosen = chosenFolder();
    const sync = fakeFolderSync({ chooseFolder: vi.fn(async () => chosen) });
    renderWith(sync, <BackupFolderCard />);

    await user.click(screen.getByRole("button", { name: "Choose a folder…" }));
    const dialog = await screen.findByRole("dialog", { name: "Save backups to this folder" });
    expect(within(dialog).getByRole("checkbox", { name: /Encrypt the backups/ })).toBeChecked();

    await user.type(within(dialog).getByLabelText(/^Passphrase/), "short");
    await user.type(within(dialog).getByLabelText(/^Repeat the passphrase/), "short");
    await user.click(within(dialog).getByRole("button", { name: "Connect folder" }));
    expect(await within(dialog).findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(sync.connectFolder).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText(/^Passphrase/));
    await user.type(within(dialog).getByLabelText(/^Passphrase/), PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Connect folder" }));
    expect(await within(dialog).findByText("The two passphrases do not match.")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/^Repeat the passphrase/));
    await user.type(within(dialog).getByLabelText(/^Repeat the passphrase/), PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Connect folder" }));

    await waitFor(() => expect(sync.connectFolder).toHaveBeenCalledWith(chosen, PASSPHRASE));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("warns, and connects in plain text, when encryption is turned off", async () => {
    const user = userEvent.setup();
    const chosen = chosenFolder();
    const sync = fakeFolderSync({ chooseFolder: vi.fn(async () => chosen) });
    renderWith(sync, <BackupFolderCard />);

    await user.click(screen.getByRole("button", { name: "Choose a folder…" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /Encrypt the backups/ }));

    expect(within(dialog).getByText(/Without encryption, anyone who can open this folder/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^Passphrase/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Connect folder" }));

    await waitFor(() => expect(sync.connectFolder).toHaveBeenCalledWith(chosen, null));
  });

  it("asks only for the passphrase when the folder already holds encrypted backups", async () => {
    const user = userEvent.setup();
    const chosen = chosenFolder({ head: SEALED_HEAD });
    const connectFolder = vi
      .fn<FolderSync["connectFolder"]>()
      .mockRejectedValueOnce(new SnapshotCryptoError("wrongPassphrase", "wrong"))
      .mockResolvedValueOnce(undefined);
    renderWith(fakeFolderSync({ chooseFolder: vi.fn(async () => chosen), connectFolder }), <BackupFolderCard />);

    await user.click(screen.getByRole("button", { name: "Choose a folder…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/already holds a backup/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Connect folder" })).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/^Passphrase of the backups/), "wrong one");
    await user.click(within(dialog).getByRole("button", { name: "Connect folder" }));
    expect(await within(dialog).findByText("That passphrase does not open the backups in this folder.")).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText(/^Passphrase of the backups/));
    await user.type(within(dialog).getByLabelText(/^Passphrase of the backups/), PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Connect folder" }));
    await waitFor(() => expect(connectFolder).toHaveBeenLastCalledWith(chosen, PASSPHRASE));
  });

  it("does not offer to connect a folder written by a newer version", async () => {
    const user = userEvent.setup();
    const chosen = chosenFolder({ newerFormat: true });
    renderWith(fakeFolderSync({ chooseFolder: vi.fn(async () => chosen) }), <BackupFolderCard />);

    await user.click(screen.getByRole("button", { name: "Choose a folder…" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText(/newer version of the app/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Connect folder" })).not.toBeInTheDocument();
  });

  it("shows how a connected folder stands and saves on request", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({
      status: "synced",
      folderName: "Backups",
      encrypted: true,
      lastSyncedAt: "2026-06-15T09:00:00.000Z",
    });
    renderWith(sync, <BackupFolderCard />);

    expect(screen.getByText(/Folder:/)).toHaveTextContent("Backups");
    expect(screen.getByText("Your plan is saved in the folder.")).toBeInTheDocument();
    expect(screen.getByText(/Last saved:/)).toHaveTextContent("15/06/2026");
    expect(screen.getByText("Backups are encrypted with your passphrase.")).toBeInTheDocument();
    expect(screen.getByText(/Exported files are never encrypted/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save now" }));
    expect(sync.syncNow).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(sync.disconnect).toHaveBeenCalled();
  });

  it("asks before writing plain text backups, and changes the passphrase", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "synced", folderName: "Backups", encrypted: true });
    renderWith(sync, <BackupFolderCard />);

    await user.click(screen.getByRole("button", { name: "Turn off encryption" }));
    const confirm = await screen.findByRole("dialog", { name: "Turn off encryption?" });
    await user.click(within(confirm).getByRole("button", { name: "Turn off encryption" }));
    expect(sync.changeEncryption).toHaveBeenCalledWith(null);

    await user.click(screen.getByRole("button", { name: "Change passphrase" }));
    const dialog = await screen.findByRole("dialog", { name: "Change passphrase" });
    await user.type(within(dialog).getByLabelText(/^Passphrase/), PASSPHRASE);
    await user.type(within(dialog).getByLabelText(/^Repeat the passphrase/), PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sync.changeEncryption).toHaveBeenLastCalledWith(PASSPHRASE));
  });

  it("offers to turn encryption on when the backups are plain", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "synced", folderName: "Backups", encrypted: false });
    renderWith(sync, <BackupFolderCard />);

    expect(screen.getByText(/Backups are not encrypted/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn on encryption" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn on encryption" });
    await user.type(within(dialog).getByLabelText(/^Passphrase/), PASSPHRASE);
    await user.type(within(dialog).getByLabelText(/^Repeat the passphrase/), PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sync.changeEncryption).toHaveBeenCalledWith(PASSPHRASE));
  });

  it("explains a lost folder and lets the user pick again", () => {
    renderWith(fakeFolderSync({ status: "error", problem: "missing", folderName: "Backups" }), <BackupFolderCard />);

    expect(screen.getByText(/could not be found/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change folder" })).toBeInTheDocument();
  });

  it("asks to allow access, or to review the choice that is waiting", async () => {
    const user = userEvent.setup();
    const waiting = fakeFolderSync({ status: "needsPermission", permission: "prompt", folderName: "Backups" });
    const first = renderWith(waiting, <BackupFolderCard />);
    expect(screen.queryByRole("button", { name: "Save now" })).not.toBeInTheDocument();
    expect(screen.getByText(/choose ".?Allow on every visit.?"/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow access" }));
    expect(waiting.reconnect).toHaveBeenCalled();
    first.unmount();

    const paused = fakeFolderSync({ status: "paused", folderName: "Backups" });
    renderWith(paused, <BackupFolderCard />);
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(paused.reviewCloudVersion).toHaveBeenCalled();
  });
});

describe("SyncPromptDialog", () => {
  const prompt = (overrides: Partial<SyncPrompt> = {}): SyncPrompt => ({
    kind: "load",
    deviceWasEmpty: false,
    needsPassphrase: false,
    cloud: { id: "x", savedAt: "2026-06-14T08:00:00.000Z", deviceLabel: "Chrome on Android", encrypted: false },
    ...overrides,
  });

  it("renders nothing without a question", () => {
    renderWith(fakeFolderSync({ status: "synced" }), <SyncPromptDialog />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers to load the backup on an empty device, without a choice to keep nothing", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "paused", prompt: prompt({ deviceWasEmpty: true }) });
    renderWith(sync, <SyncPromptDialog />);

    const dialog = screen.getByRole("dialog", { name: "A backup was found in your folder" });
    expect(dialog).toHaveTextContent("14/06/2026");
    expect(dialog).toHaveTextContent("Chrome on Android");
    expect(within(dialog).queryByRole("button", { name: "Keep this device's version" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Use the folder's version" }));
    expect(sync.resolvePrompt).toHaveBeenCalledWith("useCloud", undefined);
  });

  it("lets the user keep this device's version when both sides changed", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "paused", prompt: prompt({ kind: "conflict" }) });
    renderWith(sync, <SyncPromptDialog />);

    const dialog = screen.getByRole("dialog", { name: "Choose which version to keep" });
    expect(dialog).toHaveTextContent("your current plan is saved first");
    await user.click(within(dialog).getByRole("button", { name: "Keep this device's version" }));

    expect(sync.resolvePrompt).toHaveBeenCalledWith("keepLocal", undefined);
  });

  it("postpones the question on Escape", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "paused", prompt: prompt() });
    renderWith(sync, <SyncPromptDialog />);

    await user.keyboard("{Escape}");

    expect(sync.resolvePrompt).toHaveBeenCalledWith("later", undefined);
  });

  it("needs the passphrase of an encrypted backup and says when it is wrong", async () => {
    const user = userEvent.setup();
    const resolvePrompt = vi
      .fn<FolderSync["resolvePrompt"]>()
      .mockResolvedValueOnce("wrongPassphrase")
      .mockResolvedValueOnce("done");
    const sync = fakeFolderSync({ status: "paused", resolvePrompt, prompt: prompt({ needsPassphrase: true }) });
    renderWith(sync, <SyncPromptDialog />);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Use the folder's version" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Passphrase of this backup/), "nope");
    await user.click(within(dialog).getByRole("button", { name: "Use the folder's version" }));
    expect(await within(dialog).findByText("That passphrase does not open the backups in this folder.")).toBeInTheDocument();
    expect(resolvePrompt).toHaveBeenLastCalledWith("useCloud", "nope");

    await user.clear(within(dialog).getByLabelText(/^Passphrase of this backup/));
    await user.type(within(dialog).getByLabelText(/^Passphrase of this backup/), PASSPHRASE);
    await user.click(within(dialog).getByRole("button", { name: "Use the folder's version" }));
    await waitFor(() => expect(resolvePrompt).toHaveBeenLastCalledWith("useCloud", PASSPHRASE));
  });
});

describe("BackupFolderNotice", () => {
  it("asks for a click when the browser wants permission again", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "needsPermission", permission: "prompt" });
    renderWith(sync, <BackupFolderNotice />);

    await user.click(screen.getByRole("button", { name: "Allow access" }));

    expect(sync.reconnect).toHaveBeenCalled();
    expect(screen.getByText(/choose ".?Allow on every visit.?"/)).toBeInTheDocument();
  });

  it("points to Settings when permission was refused", () => {
    renderWith(fakeFolderSync({ status: "needsPermission", permission: "denied" }), <BackupFolderNotice />);

    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByText(/Allow on every visit/)).not.toBeInTheDocument();
  });

  it("brings back a choice the user put off", async () => {
    const user = userEvent.setup();
    const sync = fakeFolderSync({ status: "paused" });
    renderWith(sync, <BackupFolderNotice />);

    await user.click(screen.getByRole("button", { name: "Review" }));

    expect(sync.reviewCloudVersion).toHaveBeenCalled();
  });

  it("stays quiet when all is well, on short-lived trouble, and on Settings", () => {
    const quiet = [
      fakeFolderSync({ status: "synced" }),
      fakeFolderSync({ status: "error", problem: "failed" }),
      fakeFolderSync({ status: "error", problem: "unreadable" }),
      fakeFolderSync({ status: "off" }),
    ];
    for (const sync of quiet) {
      const view = renderWith(sync, <BackupFolderNotice />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      view.unmount();
    }

    renderWith(fakeFolderSync({ status: "paused" }), <BackupFolderNotice />, "/settings");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports a folder that is gone", () => {
    renderWith(fakeFolderSync({ status: "error", problem: "missing" }), <BackupFolderNotice />);

    expect(screen.getByRole("status")).toHaveTextContent("could not be found");
  });
});
