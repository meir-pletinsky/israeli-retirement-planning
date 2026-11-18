import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { passphraseProblem, useFolderSync, type ChosenFolder } from "../app/folderSync";
import { formatLocalDate } from "../i18n/formatters";
import { SnapshotCryptoError } from "../storage/sync/snapshotCrypto";
import { CheckboxField } from "./fields/CheckboxField";
import { PasswordField } from "./fields/PasswordField";
import { FormModal } from "./FormModal";
import { NewPassphraseFields } from "./NewPassphraseFields";

const isolate = (text: string) => `\u2066${text}\u2069`;

interface BackupFolderSetupDialogProps {
  chosen: ChosenFolder;
  onClose: () => void;
  /** The user is starting from a backup that is already in the folder, e.g. on the welcome page. */
  restore?: boolean;
}

/** Asks how to protect the backups in the folder the user just picked, then connects it. */
export function BackupFolderSetupDialog({ chosen, onClose, restore = false }: BackupFolderSetupDialogProps) {
  const { t } = useTranslation();
  const { connectFolder } = useFolderSync();
  const formId = useId();
  const sealedHead = chosen.head?.encryption != null;
  const [encrypt, setEncrypt] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"wrongPassphrase" | "failed" | null>(null);

  const usable = !chosen.newerFormat;

  async function submit() {
    setTried(true);
    if (sealedHead ? passphrase === "" : encrypt && passphraseProblem(passphrase, confirmation)) return;
    setBusy(true);
    setError(null);
    try {
      await connectFolder(chosen, sealedHead || encrypt ? passphrase : null);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof SnapshotCryptoError && failure.code === "wrongPassphrase"
          ? "wrongPassphrase"
          : "failed",
      );
      setBusy(false);
    }
  }

  return (
    <FormModal
      open
      title={t(restore ? "settings.sync.setup.restoreTitle" : "settings.sync.setup.title")}
      closeLabel={t("common.close")}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost text-slate-700 hover:bg-slate-100">
            {usable ? t("common.cancel") : t("common.close")}
          </button>
          {usable && (
            <button
              type="submit"
              form={formId}
              disabled={busy || (sealedHead && passphrase === "")}
              className="btn btn-primary"
            >
              {t("settings.sync.setup.connect")}
            </button>
          )}
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-4 text-sm text-slate-700"
      >
        <p>{t("settings.sync.folder", { name: isolate(chosen.name) })}</p>

        {chosen.newerFormat && (
          <p role="alert" className="text-red-700">
            {t("settings.sync.setup.newerFormat")}
          </p>
        )}

        {usable && chosen.head && (
          <p>
            {t(restore ? "settings.sync.setup.restoreExisting" : "settings.sync.setup.existing", {
              date: isolate(formatLocalDate(chosen.head.savedAt)),
              device: isolate(chosen.head.deviceLabel),
            })}
          </p>
        )}
        {usable && !chosen.head && chosen.unreadable > 0 && (
          <p className="text-amber-800">{t("settings.sync.setup.unreadable")}</p>
        )}

        {usable && sealedHead && (
          <PasswordField
            label={t("settings.sync.setup.enterPassphrase")}
            value={passphrase}
            onChange={setPassphrase}
            autoComplete="current-password"
            autoFocus
            error={error === "wrongPassphrase" ? t("settings.sync.wrongPassphrase") : null}
          />
        )}

        {usable && !sealedHead && (
          <>
            <CheckboxField
              label={t("settings.sync.setup.encrypt")}
              checked={encrypt}
              onChange={setEncrypt}
            />
            {encrypt ? (
              <>
                <NewPassphraseFields
                  passphrase={passphrase}
                  confirmation={confirmation}
                  onPassphraseChange={setPassphrase}
                  onConfirmationChange={setConfirmation}
                  showProblem={tried}
                  autoFocus
                />
                {chosen.head && <p className="text-xs text-slate-600">{t("settings.sync.setup.olderPlain")}</p>}
              </>
            ) : (
              <p role="note" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                {t("settings.sync.setup.plainWarning")}
              </p>
            )}
          </>
        )}

        {error === "failed" && (
          <p role="alert" className="text-red-700">
            {t("settings.sync.setup.failed")}
          </p>
        )}
      </form>
    </FormModal>
  );
}
