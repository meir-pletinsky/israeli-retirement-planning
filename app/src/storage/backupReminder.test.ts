import { describe, expect, it } from "vitest";

import { BACKUP_INTERVAL_DAYS, BACKUP_SNOOZE_DAYS, isBackupDue, snoozeUntil } from "./backupReminder";

const NOW = new Date("2026-06-15T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600 * 1000).toISOString();
const daysAhead = (days: number) => daysAgo(-days);

const base = { hasData: true, lastExportedAt: null, snoozedUntil: null, now: NOW };

describe("isBackupDue", () => {
  it("is not due when there is nothing to back up", () => {
    expect(isBackupDue({ ...base, hasData: false })).toBe(false);
  });

  it("is due when a plan with data was never exported", () => {
    expect(isBackupDue(base)).toBe(true);
  });

  it("is not due shortly after an export", () => {
    expect(isBackupDue({ ...base, lastExportedAt: daysAgo(1) })).toBe(false);
    expect(isBackupDue({ ...base, lastExportedAt: daysAgo(BACKUP_INTERVAL_DAYS - 1) })).toBe(false);
  });

  it("is due once the interval since the last export has passed", () => {
    expect(isBackupDue({ ...base, lastExportedAt: daysAgo(BACKUP_INTERVAL_DAYS) })).toBe(true);
    expect(isBackupDue({ ...base, lastExportedAt: daysAgo(90) })).toBe(true);
  });

  it("stays quiet while a reminder is snoozed, and returns when the snooze runs out", () => {
    expect(isBackupDue({ ...base, snoozedUntil: daysAhead(3) })).toBe(false);
    expect(isBackupDue({ ...base, snoozedUntil: daysAgo(1) })).toBe(true);
  });

  it("treats an unreadable timestamp as never exported and never snoozed", () => {
    expect(isBackupDue({ ...base, lastExportedAt: "garbage", snoozedUntil: "garbage" })).toBe(true);
  });
});

describe("snoozeUntil", () => {
  it("runs out a week from now", () => {
    expect(BACKUP_SNOOZE_DAYS).toBe(7);
    expect(snoozeUntil(NOW)).toBe(daysAhead(7));
  });
});
