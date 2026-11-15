import { useCallback } from "react";

import { isEmptyWhatIfDraft } from "../domain";
import { exportProfileToFile } from "../storage/profileIO";
import { useBackupStatus } from "./backupStatus";
import { useProfile } from "./ProfileContext";
import { useWhatIfDraft } from "./whatIfDraft";

/**
 * Downloads the plan, with the What if draft if there is one, as a backup file and remembers
 * when, so "Last exported" and the backup prompt stay truthful. Every backup button goes through
 * this; the verification export does not, because that file cannot be imported back.
 */
export function useExportBackup(): () => void {
  const { profile } = useProfile();
  const { draft } = useWhatIfDraft();
  const { recordExport } = useBackupStatus();
  return useCallback(() => {
    exportProfileToFile(profile, isEmptyWhatIfDraft(draft) ? null : draft);
    recordExport();
  }, [profile, draft, recordExport]);
}
