import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ALWAYS_ALLOW_OPTION, useFolderSync, type ChosenFolder, type FolderSyncProblem } from "../app/folderSync";
import { formatLocalDate } from "../i18n/formatters";
import { BackupFolderSetupDialog } from "./BackupFolderSetupDialog";
import { BackupPassphraseDialog } from "./BackupPassphraseDialog";
import { ConfirmModal } from "./ConfirmModal";

const isolate = (text: string) => `\u2066${text}\u2069`;

/** What the card says about a folder that has a problem; the others say it through the status. */
const PROBLEM_KEYS: Record<FolderSyncProblem, string> = {
  permission: "settings.sync.problem.permission",
  missing: "settings.sync.problem.missing",
  failed: "settings.sync.problem.failed",
  newerFormat: "settings.sync.problem.newerFormat",
  unreadable: "settings.sync.problem.unreadable",
};

/** Settings card for the optional backup folder: choosing it, seeing how it stands, and protecting it. */
export function BackupFolderCard() {
  const { t } = useTranslation();
  const sync = useFolderSync();
  const [chosen, setChosen] = useState<ChosenFolder | null>(null);
  const [passphraseMode, setPassphraseMode] = useState<"turnOn" | "change" | null>(null);
  const [confirmPlain, setConfirmPlain] = useState(false);
  const [pickFailed, setPickFailed] = useState(false);

  async function pickFolder() {
    setPickFailed(false);
    try {
      const picked = await sync.chooseFolder();
      if (picked) setChosen(picked);
    } catch {
      setPickFailed(true);
    }
  }

  const { status, problem } = sync;
  const connected = status !== "off" && status !== "unsupported";
  const working = status === "checking" || status === "saving";

  return (
    <section className="card" aria-labelledby="backup-folder-title">
      <h2 id="backup-folder-title" className="mb-3 text-sm font-semibold text-slate-700">
        {t("settings.sync.title")}
      </h2>

      {status === "unsupported" && (
        <p className="text-sm text-slate-600">{t("settings.sync.unsupported")}</p>
      )}

      {status === "off" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">{t("settings.sync.intro")}</p>
          <button type="button" onClick={() => void pickFolder()} className="btn btn-secondary self-start">
            {t("settings.sync.choose")}
          </button>
          {pickFailed && (
            <p role="alert" className="text-sm text-red-700">
              {t("settings.sync.pickFailed")}
            </p>
          )}
        </div>
      )}

      {connected && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5 text-sm text-slate-700">
            <p>{t("settings.sync.folder", { name: isolate(sync.folderName ?? "") })}</p>
            <p role="status" aria-live="polite">
              {status === "error" && problem ? t(PROBLEM_KEYS[problem]) : t(`settings.sync.status.${status}`)}
            </p>
            <p>
              {sync.lastSyncedAt
                ? t("settings.sync.lastSaved", { date: isolate(formatLocalDate(sync.lastSyncedAt)) })
                : t("settings.sync.neverSaved")}
            </p>
            <p>{t(sync.encrypted ? "settings.sync.encryptionOn" : "settings.sync.encryptionOff")}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {status === "needsPermission" && (
              <button type="button" onClick={() => void sync.reconnect()} className="btn btn-sm btn-primary">
                {t("settings.sync.allowAccess")}
              </button>
            )}
            {status === "paused" && (
              <button type="button" onClick={() => sync.reviewCloudVersion()} className="btn btn-sm btn-primary">
                {t("settings.sync.review")}
              </button>
            )}
            {status !== "needsPermission" && status !== "paused" && (
              <button
                type="button"
                disabled={working}
                onClick={() => void sync.syncNow()}
                className="btn btn-sm btn-secondary"
              >
                {t("settings.sync.saveNow")}
              </button>
            )}
            <button type="button" onClick={() => void pickFolder()} className="btn btn-sm btn-secondary">
              {t("settings.sync.changeFolder")}
            </button>
            {sync.encrypted ? (
              <>
                <button type="button" onClick={() => setPassphraseMode("change")} className="btn btn-sm btn-secondary">
                  {t("settings.sync.changePassphrase")}
                </button>
                <button type="button" onClick={() => setConfirmPlain(true)} className="btn btn-sm btn-secondary">
                  {t("settings.sync.turnOffEncryption")}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setPassphraseMode("turnOn")} className="btn btn-sm btn-secondary">
                {t("settings.sync.turnOnEncryption")}
              </button>
            )}
            <button type="button" onClick={() => void sync.disconnect()} className="btn btn-sm btn-secondary">
              {t("settings.sync.disconnect")}
            </button>
          </div>

          {status === "needsPermission" && sync.permission === "prompt" && (
            <p className="text-xs text-slate-600">{t("settings.sync.allowHint", { option: ALWAYS_ALLOW_OPTION })}</p>
          )}

          {pickFailed && (
            <p role="alert" className="text-sm text-red-700">
              {t("settings.sync.pickFailed")}
            </p>
          )}
          <p className="text-xs text-slate-500">{t("settings.sync.manualNote")}</p>
        </div>
      )}

      {chosen && <BackupFolderSetupDialog chosen={chosen} onClose={() => setChosen(null)} />}
      {passphraseMode && (
        <BackupPassphraseDialog mode={passphraseMode} onClose={() => setPassphraseMode(null)} />
      )}
      <ConfirmModal
        open={confirmPlain}
        title={t("settings.sync.turnOffTitle")}
        body={t("settings.sync.turnOffBody")}
        confirmLabel={t("settings.sync.turnOffConfirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirmPlain(false)}
        onConfirm={() => {
          setConfirmPlain(false);
          void sync.changeEncryption(null);
        }}
      />
    </section>
  );
}
