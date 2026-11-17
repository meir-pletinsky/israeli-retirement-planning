import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { passphraseProblem, useFolderSync } from "../app/folderSync";
import { FormModal } from "./FormModal";
import { NewPassphraseFields } from "./NewPassphraseFields";

interface BackupPassphraseDialogProps {
  /** `turnOn` starts encrypting plain backups; `change` replaces the passphrase of encrypted ones. */
  mode: "turnOn" | "change";
  onClose: () => void;
}

export function BackupPassphraseDialog({ mode, onClose }: BackupPassphraseDialogProps) {
  const { t } = useTranslation();
  const { changeEncryption } = useFolderSync();
  const formId = useId();
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    setTried(true);
    if (passphraseProblem(passphrase, confirmation)) return;
    setBusy(true);
    setFailed(false);
    try {
      await changeEncryption(passphrase);
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <FormModal
      open
      title={t(mode === "turnOn" ? "settings.sync.passphrase.turnOnTitle" : "settings.sync.passphrase.changeTitle")}
      closeLabel={t("common.close")}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-ghost text-slate-700 hover:bg-slate-100">
            {t("common.cancel")}
          </button>
          <button type="submit" form={formId} disabled={busy} className="btn btn-primary">
            {t("common.save")}
          </button>
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
        <p>{t(mode === "turnOn" ? "settings.sync.passphrase.turnOnBody" : "settings.sync.passphrase.changeBody")}</p>
        <NewPassphraseFields
          passphrase={passphrase}
          confirmation={confirmation}
          onPassphraseChange={setPassphrase}
          onConfirmationChange={setConfirmation}
          showProblem={tried}
          autoFocus
        />
        {failed && (
          <p role="alert" className="text-red-700">
            {t("settings.sync.passphrase.failed")}
          </p>
        )}
      </form>
    </FormModal>
  );
}
