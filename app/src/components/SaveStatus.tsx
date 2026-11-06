import { useTranslation } from "react-i18next";

import { useSaveStatus } from "../app/saveStatus";

/**
 * Tells the user that edits are kept as they are made, and whether the latest one has reached this
 * device's storage. Only a failure is announced to assistive technology, so typing is not
 * interrupted by "Saving"/"Saved" on every keystroke.
 */
export function SaveStatus() {
  const { t } = useTranslation();
  const status = useSaveStatus();

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
    </p>
  );
}
