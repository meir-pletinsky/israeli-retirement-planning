/**
 * What to do when this device looks at the backup folder: nothing, save the plan there, or ask the user
 * which side wins. Kept free of the browser so every case can be tested.
 */

export interface SyncSituation {
  /** The newest backup in the folder, or null when there is none. */
  cloudHeadId: string | null;
  /** The backup this device last saved or loaded, or null when it never has. */
  lastSyncedId: string | null;
  /** The plan here holds something worth saving; an empty plan is never saved over a backup. */
  localHasData: boolean;
  /** The plan here differs from what was last saved or loaded. */
  localChanged: boolean;
}

export type SyncAction =
  | { kind: "idle" }
  | { kind: "upload" }
  /** The folder has a newer backup and nothing here would be lost by taking it. */
  | { kind: "offerLoad"; deviceWasEmpty: boolean }
  /** Both sides have something the other lacks. */
  | { kind: "conflict" };

export function planSync({ cloudHeadId, lastSyncedId, localHasData, localChanged }: SyncSituation): SyncAction {
  if (cloudHeadId === null) {
    return localHasData ? { kind: "upload" } : { kind: "idle" };
  }
  if (cloudHeadId === lastSyncedId) {
    return localHasData && localChanged ? { kind: "upload" } : { kind: "idle" };
  }
  // The newest backup in the folder is older than the one this device saved: that file is gone from the folder.
  if (lastSyncedId !== null && cloudHeadId < lastSyncedId) {
    return localHasData ? { kind: "upload" } : { kind: "idle" };
  }
  if (!localHasData) return { kind: "offerLoad", deviceWasEmpty: true };
  if (lastSyncedId !== null && !localChanged) return { kind: "offerLoad", deviceWasEmpty: false };
  return { kind: "conflict" };
}
