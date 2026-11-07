/** A plan that was last downloaded this many days ago, or earlier, is due for a fresh backup. */
export const BACKUP_INTERVAL_DAYS = 14;

/** "Remind me later" hides the backup prompt for this many days. */
export const BACKUP_SNOOZE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function timeOf(iso: string | null): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

export interface BackupReminderInput {
  /** Whether the plan holds anything worth backing up. */
  hasData: boolean;
  lastExportedAt: string | null;
  snoozedUntil: string | null;
  now: Date;
}

/**
 * Whether to offer a backup download: the plan has data and was never exported, or was last
 * exported {@link BACKUP_INTERVAL_DAYS} days ago or more, and the user has not just asked to be
 * reminded later.
 */
export function isBackupDue({ hasData, lastExportedAt, snoozedUntil, now }: BackupReminderInput): boolean {
  if (!hasData) return false;
  const snoozed = timeOf(snoozedUntil);
  if (snoozed !== null && snoozed > now.getTime()) return false;
  const exported = timeOf(lastExportedAt);
  return exported === null || now.getTime() - exported >= BACKUP_INTERVAL_DAYS * DAY_MS;
}

/** When a "remind me later" pressed at `now` runs out. */
export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + BACKUP_SNOOZE_DAYS * DAY_MS).toISOString();
}
