import { useTranslation } from "react-i18next";

import { useBackupStatus } from "../app/backupStatus";
import { useSaveStatus } from "../app/saveStatus";
import { formatLocalDate } from "../domain/dates";

const isolate = (text: string) => `\u2066${text}\u2069`;

/**
 * Tells the user that edits are kept as they are made, and whether the latest one has reached this
 * device's storage, and when the plan was last downloaded as a backup. Only a failure is announced
 * to assistive technology, so typing is not interrupted by "Saving"/"Saved" on every keystroke.
 */
export function SaveStatus() {
  const { t } = useTranslation();
  const status = useSaveStatus();
  const { lastExportedAt } = useBackupStatus();

  if (status === "error") {
    return (
      <p role="alert" className="text-xs font-medium text-red-700">
        {t("common.autosave.error")}
      </p>
    );
  }

  return (
    <p className="text-xs text-slate-500">
      {t("common.autosave.note")}{" "}
      <span className="font-medium text-slate-600">
        {t(status === "saving" ? "common.autosave.saving" : "common.autosave.saved")}
      </span>
      <span className="ms-3">
        {lastExportedAt
          ? t("common.autosave.lastExported", { date: isolate(formatLocalDate(lastExportedAt)) })
          : t("common.autosave.neverExported")}
      </span>
    </p>
  );
}
