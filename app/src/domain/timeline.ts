import { INCOME_BAND_KEYS, type IncomeBandKey, type IncomeBreakdownPoint } from "./incomeBreakdown";

/** A run of consecutive ages that are funded by the same set of sources. */
export interface TimelineSegment {
  fromAge: number;
  toAge: number;
  /** Sources paying in this period, in display order. */
  bands: IncomeBandKey[];
  /** Average monthly amount per active band over the period (today's money). */
  amounts: Partial<Record<IncomeBandKey, number>>;
  /** Average total monthly income over the period (today's money). */
  monthlyIncome: number;
}

/**
 * Groups the per-age income breakdown into timeline segments: each time a
 * source starts or stops paying (an unlock, an annuity or Bituach Leumi
 * starting, a pot running out) a new segment begins.
 */
export function buildRetirementTimeline(points: IncomeBreakdownPoint[]): TimelineSegment[] {
  const activeBands = (point: IncomeBreakdownPoint) =>
    INCOME_BAND_KEYS.filter((band) => point[band] > 0);

  const groups: { bands: IncomeBandKey[]; points: IncomeBreakdownPoint[] }[] = [];
  for (const point of points) {
    const bands = activeBands(point);
    const current = groups[groups.length - 1];
    if (current && current.bands.join() === bands.join()) {
      current.points.push(point);
    } else {
      groups.push({ bands, points: [point] });
    }
  }

  return groups.map(({ bands, points: members }) => {
    const average = (pick: (point: IncomeBreakdownPoint) => number) =>
      Math.round(members.reduce((sum, point) => sum + pick(point), 0) / members.length);
    const amounts: Partial<Record<IncomeBandKey, number>> = {};
    for (const band of bands) {
      amounts[band] = average((point) => point[band]);
    }
    return {
      fromAge: members[0].age,
      toAge: members[members.length - 1].age,
      bands,
      amounts,
      monthlyIncome: average((point) =>
        INCOME_BAND_KEYS.reduce((sum, band) => sum + point[band], 0),
      ),
    };
  });
}
