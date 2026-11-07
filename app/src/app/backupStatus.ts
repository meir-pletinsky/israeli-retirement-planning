import { createContext, useContext } from "react";

/**
 * When the plan was last downloaded as a backup file, and the controls around it. Kept apart from
 * the profile context so a profile edit does not re-render everything that only shows this.
 */
export interface BackupStatus {
  /** ISO timestamp of the last backup download, or null if there has never been one. */
  lastExportedAt: string | null;
  /** ISO timestamp until which the backup prompt stays hidden, or null. */
  snoozedUntil: string | null;
  /** Records that a backup file was just downloaded. */
  recordExport: () => void;
  /** Hides the backup prompt for a while. */
  snoozePrompt: () => void;
}

export const BackupStatusContext = createContext<BackupStatus>({
  lastExportedAt: null,
  snoozedUntil: null,
  recordExport: () => {},
  snoozePrompt: () => {},
});

export function useBackupStatus(): BackupStatus {
  return useContext(BackupStatusContext);
}
