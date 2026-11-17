import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isEmptyWhatIfDraft, readWhatIfDraft } from "../domain";
import {
  clearSyncFolderConfig,
  loadSyncFolderConfig,
  saveBeforeImportRestorePoint,
  saveSyncFolderConfig,
  updateSyncFolderConfig,
  type SyncFolderConfig,
} from "../storage/db";
import { readProfileObject } from "../storage/profileIO";
import { describeDevice } from "../storage/sync/deviceLabel";
import {
  FolderError,
  folderFromHandle,
  isFolderSyncSupported,
  pickFolder,
  queryFolderPermission,
  requestFolderPermission,
  type FolderPermission,
  type SyncFolder,
} from "../storage/sync/folderAccess";
import {
  deriveVaultKey,
  SnapshotCryptoError,
  vaultFits,
  type VaultKey,
} from "../storage/sync/snapshotCrypto";
import { SnapshotError, type SnapshotEnvelope } from "../storage/sync/snapshotFile";
import {
  backupPayload,
  openSnapshot,
  payloadFingerprint,
  pruneSnapshots,
  readHead,
  vaultOpens,
  writeSnapshot,
} from "../storage/sync/syncEngine";
import { planSync } from "../storage/sync/syncPlan";
import { hasProfileData } from "../types";

import {
  FolderSyncContext,
  MIN_PASSPHRASE_LENGTH,
  type ChosenFolder,
  type CloudVersion,
  type FolderSync,
  type FolderSyncProblem,
  type FolderSyncStatus,
  type PromptChoice,
  type PromptOutcome,
  type SyncPrompt,
} from "./folderSync";
import { useProfile } from "./ProfileContext";
import { useWhatIfDraft } from "./whatIfDraft";

/** How the provider reaches the browser's folder access; replaced in tests. */
export interface FolderSyncDeps {
  pickFolder: () => Promise<FileSystemDirectoryHandle | null>;
  openFolder: (handle: FileSystemDirectoryHandle) => SyncFolder;
  queryPermission: (handle: FileSystemDirectoryHandle) => Promise<FolderPermission>;
  requestPermission: (handle: FileSystemDirectoryHandle) => Promise<FolderPermission>;
}

export interface FolderSyncTiming {
  /** How long after the last change the plan is saved to the folder. */
  uploadDelayMs: number;
  /** The least time between two saves. */
  minUploadIntervalMs: number;
  /** The least time between two looks at the folder when the tab comes back. */
  recheckMinIntervalMs: number;
}

const BROWSER_DEPS: FolderSyncDeps = {
  pickFolder,
  openFolder: folderFromHandle,
  queryPermission: queryFolderPermission,
  requestPermission: requestFolderPermission,
};

const DEFAULT_TIMING: FolderSyncTiming = {
  uploadDelayMs: 30_000,
  minUploadIntervalMs: 2 * 60_000,
  recheckMinIntervalMs: 30_000,
};

type Blocked =
  | { status: "needsPermission"; permission: FolderPermission }
  | { status: "paused" }
  | { status: "error"; problem: FolderSyncProblem };

type Phase = "idle" | "checking" | "saving";

function blockedBy(error: unknown): Blocked {
  if (error instanceof FolderError) {
    if (error.code === "permission") return { status: "needsPermission", permission: "prompt" };
    return { status: "error", problem: error.code === "missing" ? "missing" : "failed" };
  }
  return { status: "error", problem: "failed" };
}

function cloudVersion(head: SnapshotEnvelope): CloudVersion {
  return { id: head.id, savedAt: head.savedAt, deviceLabel: head.deviceLabel, encrypted: head.encryption !== null };
}

async function isSameFolder(a: FileSystemDirectoryHandle, b: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return await a.isSameEntry(b);
  } catch {
    return false;
  }
}

/**
 * Keeps the plan in step with the backup folder the user connected: saves it there a little after it
 * changes, and on opening asks what to do when the folder holds something newer. Mount it inside the
 * ProfileProvider.
 */
export function FolderSyncProvider({
  children,
  deps = BROWSER_DEPS,
  supported = isFolderSyncSupported(),
  timing = DEFAULT_TIMING,
  kdfIterations,
}: {
  children: ReactNode;
  deps?: FolderSyncDeps;
  supported?: boolean;
  timing?: FolderSyncTiming;
  /** Only for tests: a low number makes key derivation quick. */
  kdfIterations?: number;
}) {
  const { profile, updateProfile, completeOnboarding } = useProfile();
  const { draft, restoreDraft } = useWhatIfDraft();

  const [config, setConfig] = useState<SyncFolderConfig | null>(null);
  const [loaded, setLoaded] = useState(!supported);
  const [phase, setPhase] = useState<Phase>("idle");
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [prompt, setPrompt] = useState<SyncPrompt | null>(null);

  const exportedDraft = isEmptyWhatIfDraft(draft) ? null : draft;
  const payload = useMemo(() => backupPayload(profile, exportedDraft), [profile, exportedDraft]);
  const hash = useMemo(() => payloadFingerprint(payload), [payload]);
  const hasData = useMemo(() => hasProfileData(profile), [profile]);

  const live = useRef({
    profile,
    payload,
    hash,
    hasData,
    config,
    blocked,
    deps,
    timing,
    updateProfile,
    restoreDraft,
    completeOnboarding,
  });
  useEffect(() => {
    live.current = {
      profile,
      payload,
      hash,
      hasData,
      config,
      blocked,
      deps,
      timing,
      updateProfile,
      restoreDraft,
      completeOnboarding,
    };
  });

  const inFlight = useRef(false);
  const rerun = useRef<{ force: boolean } | null>(null);
  const promptHead = useRef<SnapshotEnvelope | null>(null);
  const declinedHeadId = useRef<string | null>(null);
  const lastCheckAt = useRef(0);
  const lastUploadAt = useRef(0);

  const saveToFolder = useCallback(async (cfg: SyncFolderConfig, folder: SyncFolder, parentId: string | null) => {
    setPhase("saving");
    const { payload: toSave, hash: savedHash } = live.current;
    const meta = await writeSnapshot(folder, {
      payload: toSave,
      vault: cfg.vault,
      deviceId: cfg.deviceId,
      deviceLabel: cfg.deviceLabel,
      parentId,
      now: new Date(),
    });
    lastUploadAt.current = Date.now();
    const progress = { lastSyncedId: meta.id, lastSyncedHash: savedHash, lastSyncedAt: meta.savedAt };
    await updateSyncFolderConfig(progress);
    setConfig((current) => (current ? { ...current, ...progress } : current));
    try {
      await pruneSnapshots(folder, new Date());
    } catch {
      // Tidying up can wait for the next save.
    }
  }, []);

  const checkOnce = useCallback(
    async (force: boolean) => {
      const cfg = await loadSyncFolderConfig();
      setLoaded(true);
      setConfig(cfg ?? null);
      if (!cfg) {
        setBlocked(null);
        return;
      }
      if (promptHead.current) return;

      lastCheckAt.current = Date.now();
      setPhase("checking");
      setBlocked(null);
      try {
        const { deps: access, timing: pace } = live.current;
        const permission = await access.queryPermission(cfg.handle);
        if (permission !== "granted") {
          setBlocked({ status: "needsPermission", permission });
          return;
        }
        const folder = access.openFolder(cfg.handle);
        const found = await readHead(folder);
        if (found.newerFormat) {
          setBlocked({ status: "error", problem: "newerFormat" });
          return;
        }
        if (!found.head && found.unreadable > 0) {
          setBlocked({ status: "error", problem: "unreadable" });
          return;
        }

        const action = planSync({
          cloudHeadId: found.head?.id ?? null,
          lastSyncedId: cfg.lastSyncedId,
          localHasData: live.current.hasData,
          localChanged: cfg.lastSyncedHash !== live.current.hash,
        });

        if (action.kind === "upload") {
          if (!force && Date.now() - lastUploadAt.current < pace.minUploadIntervalMs) return;
          await saveToFolder(cfg, folder, found.head?.id ?? null);
        } else if (action.kind !== "idle" && found.head) {
          setBlocked({ status: "paused" });
          if (found.head.id === declinedHeadId.current) return;
          promptHead.current = found.head;
          setPrompt({
            kind: action.kind === "conflict" ? "conflict" : "load",
            deviceWasEmpty: action.kind === "offerLoad" && action.deviceWasEmpty,
            cloud: cloudVersion(found.head),
            needsPassphrase: !vaultOpens(found.head, cfg.vault),
          });
        }
      } catch (error) {
        setBlocked(blockedBy(error));
      } finally {
        setPhase("idle");
      }
    },
    [saveToFolder],
  );

  const runCheck = useCallback(
    async (force: boolean) => {
      if (inFlight.current) {
        rerun.current = { force: force || (rerun.current?.force ?? false) };
        return;
      }
      inFlight.current = true;
      try {
        await checkOnce(force);
      } finally {
        inFlight.current = false;
        const again = rerun.current;
        rerun.current = null;
        if (again) void runCheck(again.force);
      }
    },
    [checkOnce],
  );

  useEffect(() => {
    if (supported) void runCheck(false);
  }, [supported, runCheck]);

  // A change is saved a little after the last one, and no sooner than a while after the previous save.
  const waitingToSave =
    config !== null && blocked === null && phase === "idle" && hasData && hash !== config.lastSyncedHash;
  useEffect(() => {
    if (!waitingToSave) return;
    const wait = Math.max(
      timing.uploadDelayMs,
      lastUploadAt.current + timing.minUploadIntervalMs - Date.now(),
    );
    const timer = setTimeout(() => void runCheck(true), wait);
    return () => clearTimeout(timer);
  }, [waitingToSave, hash, timing.uploadDelayMs, timing.minUploadIntervalMs, runCheck]);

  // Leaving the tab saves what is waiting; coming back looks at the folder again.
  useEffect(() => {
    if (!supported) return;
    const recheck = () => {
      if (Date.now() - lastCheckAt.current >= live.current.timing.recheckMinIntervalMs) void runCheck(false);
    };
    const onVisibility = () => {
      const now = live.current;
      if (document.visibilityState === "hidden") {
        if (now.config && now.blocked === null && now.hash !== now.config.lastSyncedHash) void runCheck(true);
      } else {
        recheck();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", recheck);
    };
  }, [supported, runCheck]);

  const chooseFolder = useCallback(async (): Promise<ChosenFolder | null> => {
    const { deps: access } = live.current;
    const handle = await access.pickFolder();
    if (!handle) return null;
    const found = await readHead(access.openFolder(handle));
    return { handle, name: handle.name, head: found.head, unreadable: found.unreadable, newerFormat: found.newerFormat };
  }, []);

  const connectFolder = useCallback(
    async (chosen: ChosenFolder, passphrase: string | null) => {
      if (chosen.newerFormat) {
        throw new SnapshotError("tooNew", "The folder holds a backup written by a newer version of the app.");
      }
      let vault: VaultKey | null = null;
      if (chosen.head?.encryption) {
        if (passphrase === null) {
          throw new SnapshotCryptoError("passphraseNeeded", "The backups in this folder are sealed with a passphrase.");
        }
        vault = await deriveVaultKey(passphrase, chosen.head.encryption);
        await openSnapshot(chosen.head, vault);
      } else if (passphrase !== null) {
        if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
          throw new SnapshotCryptoError("invalid", "The passphrase is too short.");
        }
        vault = await deriveVaultKey(passphrase, undefined, { iterations: kdfIterations });
      }

      const existing = await loadSyncFolderConfig();
      const sameFolder = existing ? await isSameFolder(existing.handle, chosen.handle) : false;
      await saveSyncFolderConfig({
        handle: chosen.handle,
        folderName: chosen.name,
        deviceId: existing?.deviceId ?? crypto.randomUUID(),
        deviceLabel: describeDevice(navigator.userAgent),
        vault,
        lastSyncedId: sameFolder ? (existing?.lastSyncedId ?? null) : null,
        lastSyncedHash: sameFolder ? (existing?.lastSyncedHash ?? null) : null,
        lastSyncedAt: sameFolder ? (existing?.lastSyncedAt ?? null) : null,
      });
      declinedHeadId.current = null;
      promptHead.current = null;
      setPrompt(null);
      await runCheck(true);
    },
    [kdfIterations, runCheck],
  );

  const disconnect = useCallback(async () => {
    await clearSyncFolderConfig();
    declinedHeadId.current = null;
    promptHead.current = null;
    setPrompt(null);
    setBlocked(null);
    setConfig(null);
  }, []);

  const reconnect = useCallback(async () => {
    // Called with the config already in memory: the browser only shows its question for a call made right in the click.
    const current = live.current.config;
    if (!current) return;
    try {
      const permission = await live.current.deps.requestPermission(current.handle);
      if (permission === "granted") await runCheck(false);
      else setBlocked({ status: "needsPermission", permission });
    } catch (error) {
      setBlocked(blockedBy(error));
    }
  }, [runCheck]);

  const syncNow = useCallback(() => runCheck(true), [runCheck]);

  const reviewCloudVersion = useCallback(() => {
    declinedHeadId.current = null;
    void runCheck(false);
  }, [runCheck]);

  const resolvePrompt = useCallback(
    async (choice: PromptChoice, passphrase?: string): Promise<PromptOutcome> => {
      const head = promptHead.current;
      if (!head) return "done";

      if (choice === "later") {
        declinedHeadId.current = head.id;
        promptHead.current = null;
        setPrompt(null);
        return "done";
      }

      const cfg = await loadSyncFolderConfig();
      if (!cfg) return "failed";
      inFlight.current = true;
      try {
        if (choice === "keepLocal") {
          const folder = live.current.deps.openFolder(cfg.handle);
          await saveToFolder(cfg, folder, head.id);
        } else {
          let vault = cfg.vault;
          if (head.encryption && !(vault && vaultFits(vault, head.encryption))) {
            if (!passphrase) return "wrongPassphrase";
            vault = await deriveVaultKey(passphrase, head.encryption);
          }
          let opened: Record<string, unknown>;
          try {
            opened = await openSnapshot(head, vault);
          } catch (error) {
            if (error instanceof SnapshotCryptoError && error.code === "wrongPassphrase") return "wrongPassphrase";
            throw error;
          }

          const now = live.current;
          const read = readProfileObject(opened);
          if (now.hasData) await saveBeforeImportRestorePoint(now.profile);

          const restored = readWhatIfDraft(read.whatIfDraft, read.profile);
          const progress = {
            lastSyncedId: head.id,
            lastSyncedHash: payloadFingerprint(
              backupPayload(read.profile, isEmptyWhatIfDraft(restored) ? null : restored),
            ),
            lastSyncedAt: new Date().toISOString(),
            vault: head.encryption ? vault : cfg.vault,
          };
          now.updateProfile(read.profile);
          now.restoreDraft(read.whatIfDraft, read.profile);
          now.completeOnboarding();
          await updateSyncFolderConfig(progress);
          setConfig({ ...cfg, ...progress });
        }
        declinedHeadId.current = null;
        promptHead.current = null;
        setPrompt(null);
        setBlocked(null);
        return "done";
      } catch (error) {
        setBlocked(blockedBy(error));
        return "failed";
      } finally {
        setPhase("idle");
        inFlight.current = false;
        const again = rerun.current;
        rerun.current = null;
        if (again) void runCheck(again.force);
      }
    },
    [runCheck, saveToFolder],
  );

  const changeEncryption = useCallback(
    async (passphrase: string | null) => {
      if (!live.current.config) return;
      if (passphrase !== null && passphrase.length < MIN_PASSPHRASE_LENGTH) {
        throw new SnapshotCryptoError("invalid", "The passphrase is too short.");
      }
      const vault =
        passphrase === null ? null : await deriveVaultKey(passphrase, undefined, { iterations: kdfIterations });
      // Forgetting what was last saved makes the next look at the folder save the plan again, in the new form.
      await updateSyncFolderConfig({ vault, lastSyncedHash: null });
      await runCheck(true);
    },
    [kdfIterations, runCheck],
  );

  const status: FolderSyncStatus = !supported
    ? "unsupported"
    : !loaded
      ? "checking"
      : !config
        ? "off"
        : (blocked?.status ??
          (phase !== "idle" ? phase : hasData && hash !== config.lastSyncedHash ? "pending" : "synced"));

  const value = useMemo<FolderSync>(
    () => ({
      supported,
      status,
      problem: blocked?.status === "error" ? blocked.problem : null,
      permission: blocked?.status === "needsPermission" ? blocked.permission : null,
      folderName: config?.folderName ?? null,
      encrypted: config?.vault != null,
      lastSyncedAt: config?.lastSyncedAt ?? null,
      prompt,
      chooseFolder,
      connectFolder,
      disconnect,
      reconnect,
      syncNow,
      resolvePrompt,
      reviewCloudVersion,
      changeEncryption,
    }),
    [
      supported,
      status,
      blocked,
      config,
      prompt,
      chooseFolder,
      connectFolder,
      disconnect,
      reconnect,
      syncNow,
      resolvePrompt,
      reviewCloudVersion,
      changeEncryption,
    ],
  );

  return <FolderSyncContext.Provider value={value}>{children}</FolderSyncContext.Provider>;
}
