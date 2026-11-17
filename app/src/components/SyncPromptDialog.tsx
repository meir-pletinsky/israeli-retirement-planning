import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { useFolderSync, type PromptChoice } from "../app/folderSync";
import { formatLocalDate } from "../i18n/formatters";
import { PasswordField } from "./fields/PasswordField";
import { FormModal } from "./FormModal";

const isolate = (text: string) => `\u2066${text}\u2069`;

/**
 * Asks which version to keep when the backup folder and this device differ. Escape and the close
 * button postpone the question; nothing is saved to the folder until it is answered.
 */
export function SyncPromptDialog() {
  const { t } = useTranslation();
  const { prompt, resolvePrompt } = useFolderSync();
  const formId = useId();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"wrongPassphrase" | "failed" | null>(null);

  if (!prompt) return null;
  const { kind, deviceWasEmpty, cloud, needsPassphrase } = prompt;

  async function answer(choice: PromptChoice) {
    setBusy(true);
    setError(null);
    const outcome = await resolvePrompt(choice, needsPassphrase && choice === "useCloud" ? passphrase : undefined).catch(
      () => "failed" as const,
    );
    setBusy(false);
    if (outcome === "done") setPassphrase("");
    else setError(outcome);
  }

  const titleKey = deviceWasEmpty ? "found" : kind === "conflict" ? "conflict" : "newer";

  return (
    <FormModal
      open
      title={t(`settings.sync.prompt.title.${titleKey}`)}
      closeLabel={t("common.close")}
      onClose={() => void answer("later")}
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void answer("later")}
            className="btn btn-ghost text-slate-700 hover:bg-slate-100"
          >
            {t("settings.sync.prompt.later")}
          </button>
          {!deviceWasEmpty && (
            <button type="button" disabled={busy} onClick={() => void answer("keepLocal")} className="btn btn-secondary">
              {t("settings.sync.prompt.keepLocal")}
            </button>
          )}
          <button
            type="submit"
            form={formId}
            disabled={busy || (needsPassphrase && passphrase === "")}
            data-autofocus={needsPassphrase ? undefined : ""}
            className="btn btn-primary"
          >
            {t("settings.sync.prompt.useCloud")}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void answer("useCloud");
        }}
        className="flex flex-col gap-4 text-sm text-slate-700"
      >
        <p>
          {t("settings.sync.prompt.saved", {
            date: isolate(formatLocalDate(cloud.savedAt)),
            device: isolate(cloud.deviceLabel),
          })}
        </p>
        <p>{t(`settings.sync.prompt.body.${titleKey}`)}</p>
        {!deviceWasEmpty && <p className="text-xs text-slate-600">{t("settings.sync.prompt.restoreNote")}</p>}
        {needsPassphrase && (
          <PasswordField
            label={t("settings.sync.prompt.passphrase")}
            value={passphrase}
            onChange={setPassphrase}
            autoComplete="current-password"
            autoFocus
            error={error === "wrongPassphrase" ? t("settings.sync.wrongPassphrase") : null}
          />
        )}
        {error === "failed" && (
          <p role="alert" className="text-red-700">
            {t("settings.sync.prompt.failed")}
          </p>
        )}
      </form>
    </FormModal>
  );
}
