import type { PathEventGroup } from "../../domain";
import type { NetWorthMarker } from "./NetWorthChart";

/** The chart lines for the event groups, numbered the way the list under the chart numbers them. */
export function netWorthMarkers(groups: readonly PathEventGroup[]): NetWorthMarker[] {
  return groups.map((group, index) => ({ age: group.age, label: String(index + 1) }));
}
