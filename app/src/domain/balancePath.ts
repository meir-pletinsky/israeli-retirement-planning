import type { ProfileData } from "../types";
import { simulateHouseholdDrawdown, type DrawdownYear } from "./drawdown";
import { desiredRetirementMonthly } from "./expenses";
import { buildHousehold, resolveRetirementTiming } from "./household";
import { roundToSum } from "./rounding";
import { SOURCE_KINDS, type SourceKind } from "./sources";
import type { RetirementScenario } from "./types";

/** The savings at the end of one year, in today's money and whole shekels. */
export interface BalancePoint {
  age: number;
  netWorth: number;
  /** The same total by kind of savings; the parts add up to `netWorth`. */
  byKind: Record<SourceKind, number>;
}

/** Something that changes the shape of the balance path, for annotating it. */
export type PathEvent =
  /** The household starts drawing on its savings (the later retirement of a couple). */
  | { type: "retirement"; age: number; household: boolean }
  /** Savings of one kind stop being a balance and become a monthly annuity. */
  | { type: "annuity"; age: number; kind: SourceKind; capital: number; monthly: number };

export interface BalancePath {
  points: BalancePoint[];
  events: PathEvent[];
  /** The kinds that hold a balance at some age, in display order. */
  kinds: SourceKind[];
}

function roundedPoint(row: DrawdownYear): BalancePoint {
  const netWorth = Math.round(row.netWorth);
  const rounded = roundToSum(
    SOURCE_KINDS.map((kind) => row.balances[kind]),
    netWorth,
  );
  return {
    age: row.age,
    netWorth,
    byKind: Object.fromEntries(SOURCE_KINDS.map((kind, index) => [kind, rounded[index]])) as Record<
      SourceKind,
      number
    >,
  };
}

/** The annuity starts of one year, with the sources of the same kind combined. */
function annuityEvents(row: DrawdownYear): PathEvent[] {
  return SOURCE_KINDS.flatMap((kind) => {
    const starts = row.conversions.filter((conversion) => conversion.kind === kind);
    if (starts.length === 0) return [];
    return [
      {
        type: "annuity" as const,
        age: row.age,
        kind,
        capital: Math.round(starts.reduce((sum, start) => sum + start.capital, 0)),
        monthly: Math.round(starts.reduce((sum, start) => sum + start.monthly, 0)),
      },
    ];
  });
}

/** The events of one age, which share a marker on the chart. */
export interface PathEventGroup {
  age: number;
  events: PathEvent[];
}

/** The events grouped by age, earliest first, in the order they came in within an age. */
export function groupPathEvents(events: readonly PathEvent[]): PathEventGroup[] {
  const groups = new Map<number, PathEvent[]>();
  for (const event of events) {
    groups.set(event.age, [...(groups.get(event.age) ?? []), event]);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([age, grouped]) => ({ age, events: grouped }));
}

/**
 * The balance path `projectNetWorth` draws, split by kind of savings (the simulation keeps each
 * pension, provident and study fund and the investments pool apart), with the events that explain
 * its steps: when drawing starts and when each kind's capital becomes an annuity. The model holds
 * bank deposits, shares and other holdings in one investments pool, so they have no separate
 * path here.
 */
export function projectBalancePath(
  profile: ProfileData,
  scenario: RetirementScenario = "standard",
): BalancePath {
  const household = buildHousehold(profile, resolveRetirementTiming(profile, scenario));
  const rows = simulateHouseholdDrawdown(household, desiredRetirementMonthly(profile.expenses) ?? 0);
  const points = rows.map(roundedPoint);
  const events: PathEvent[] = [
    { type: "retirement", age: household.drawdownStartAge, household: household.members.length > 1 },
    ...rows.flatMap(annuityEvents),
  ];
  return {
    points,
    events,
    kinds: SOURCE_KINDS.filter((kind) => points.some((point) => point.byKind[kind] > 0)),
  };
}
