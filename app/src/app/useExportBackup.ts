import { useCallback } from "react";

import { exportProfileToFile } from "../storage/profileIO";
import { useBackupStatus } from "./backupStatus";
import { useProfile } from "./ProfileContext";

/**
 * Downloads the plan as a backup file and remembers when, so "Last exported" and the backup
 * prompt stay truthful. Every backup button goes through this; the verification export does not,
 * because that file cannot be imported back.
 */
export function useExportBackup(): () => void {
  const { profile } = useProfile();
  const { recordExport } = useBackupStatus();
  return useCallback(() => {
    exportProfileToFile(profile);
    recordExport();
  }, [profile, recordExport]);
}
