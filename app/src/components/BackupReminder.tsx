import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

import { useBackupStatus } from "../app/backupStatus";
import { useProfile } from "../app/ProfileContext";
import { useExportBackup } from "../app/useExportBackup";
import { formatLocalDate } from "../domain/dates";
import { isBackupDue } from "../storage/backupReminder";
import { hasProfileData } from "../types";
import { Toast } from "./Toast";

/** The pages that show results; the prompt stays out of the way of data entry and Settings. */
const PROMPT_PATHS = ["/dashboard", "/projections"];

const isolate = (text: string) => `\u2066${text}\u2069`;

/**
 * Offers to download the plan as a file when it was never exported, or not for a while. The plan
 * lives only in this browser, so a cleared cache or a lost device would take it. "Remind me later"
 * hides the prompt for a week; downloading a backup hides it until the next one is due.
 */
export function BackupReminder() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { profile, evaluatedAt } = useProfile();
  const { lastExportedAt, snoozedUntil, snoozePrompt } = useBackupStatus();
  const exportBackup = useExportBackup();
  const [toast, setToast] = useState<string | null>(null);

  const due =
    PROMPT_PATHS.includes(pathname) &&
    isBackupDue({
      hasData: hasProfileData(profile),
      lastExportedAt,
      snoozedUntil,
      now: evaluatedAt,
    });

  return (
    <>
      {due && (
        <div
          role="note"
          aria-label={t("backup.reminder.title")}
          className="mb-4 flex flex-col gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3 sm:flex-row sm:items-center"
        >
          <div className="flex flex-1 flex-col gap-0.5">
            <p className="text-sm font-semibold text-brand-900">{t("backup.reminder.title")}</p>
            <p className="text-xs text-brand-900">
              {lastExportedAt
                ? t("backup.reminder.bodyOverdue", { date: isolate(formatLocalDate(lastExportedAt)) })
                : t("backup.reminder.bodyNever")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                exportBackup();
                setToast(t("backup.reminder.done"));
              }}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("backup.reminder.download")}
            </button>
            <button
              type="button"
              onClick={snoozePrompt}
              className="rounded-md border border-brand-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              {t("backup.reminder.later")}
            </button>
          </div>
        </div>
      )}
      <Toast message={toast} onClear={() => setToast(null)} />
    </>
  );
}
