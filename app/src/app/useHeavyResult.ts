import { useCallback, useState, useSyncExternalStore } from "react";

import type { HeavyArgs, HeavyResult, HeavyTaskName } from "../domain/heavyTasks";
import type { ProfileData } from "../types";
import { heavyCompute } from "./heavyCompute";

export interface HeavyResultState<R> {
  /** The result for the current inputs; undefined while it is being calculated, or when disabled. */
  value: R | undefined;
  /** The last result this component received, for showing while the inputs have changed and the new one is coming. */
  stale: R | undefined;
  /** True while the result for the current inputs is being calculated. */
  pending: boolean;
}

const stopWaiting = () => {};

/**
 * One of the slow simulations (see `HEAVY_TASKS`) for the profile, run off the main thread, so the
 * rest of the page can show at once. The result stays available for the same profile, so coming
 * back to the page shows it straight away. Where there is no Web Worker the result is computed
 * during the render, and `pending` is never true.
 */
export function useHeavyResult<N extends HeavyTaskName>(
  task: N,
  profile: ProfileData,
  args: HeavyArgs<N>,
  enabled = true,
): HeavyResultState<HeavyResult<N>> {
  type Result = HeavyResult<N>;
  const argsKey = JSON.stringify(args);
  const subscribe = useCallback(
    (onChange: () => void) =>
      enabled
        ? heavyCompute.subscribe(profile, task, JSON.parse(argsKey) as HeavyArgs<N>, onChange)
        : stopWaiting,
    [enabled, profile, task, argsKey],
  );
  const getSnapshot = useCallback(
    () => (enabled ? heavyCompute.read(profile, task, JSON.parse(argsKey) as HeavyArgs<N>) : null),
    [enabled, profile, task, argsKey],
  );
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = entry ? (entry.value as Result) : undefined;
  const [shown, setShown] = useState<Result | undefined>(value);
  if (value !== undefined && value !== shown) setShown(value);
  // A failure surfaces to the error boundary, as it did when the calculation ran in the render.
  if (entry?.state === "failed") throw entry.error;

  return { value, stale: value === undefined ? shown : undefined, pending: enabled && !entry };
}
