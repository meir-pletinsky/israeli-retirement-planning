import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { IncomeBandKey, TimelineSegment } from "../domain";
import { formatNumber } from "../i18n/formatters";
import { BandSwatch } from "./charts/BandSwatch";
import { ScenarioTitle } from "./ScenarioTag";

/** The two kinds of income a segment is split into: recurring payments, then withdrawals from savings. */
const SPLIT_GROUPS = [
  { key: "payments", heading: "projections.split.payments", hatched: false },
  { key: "withdrawals", heading: "projections.split.withdrawals", hatched: true },
] as const;

interface RetirementTimelineProps {
  segments: TimelineSegment[];
  labels: Record<IncomeBandKey, string>;
  currencySymbol: string;
  /** For a couple: the spouse's age when the primary user is the given age. */
  spouseAgeAt?: (selfAge: number) => number;
  /** Names the retirement scenario shown, beside the title. */
  scenarioTag?: ReactNode;
  /** Says what the income figures are, under the intro. */
  basisNote?: ReactNode;
  /** A switch between the bases the timeline can show, under the intro. */
  controls?: ReactNode;
}

export function RetirementTimeline({
  segments,
  labels,
  currencySymbol,
  spouseAgeAt,
  scenarioTag,
  basisNote,
  controls,
}: RetirementTimelineProps) {
  const { t } = useTranslation();
  const formatRange = (from: number, to: number) =>
    from === to ? String(from) : t("projections.timeline.range", { from, to });

  return (
    <section
      aria-labelledby="retirement-timeline-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <ScenarioTitle id="retirement-timeline-title" tag={scenarioTag}>
        {t("projections.timeline.title")}
      </ScenarioTitle>
      <p className="mt-1 text-xs text-slate-500">{t("projections.timeline.intro")}</p>
      {controls}
      {basisNote}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.timeline.ages")}
              </th>
              <th className="py-1 pe-3 text-start font-medium text-slate-500">
                {t("projections.timeline.sources")}
              </th>
              <th className="py-1 text-start font-medium text-slate-500">
                {t("projections.timeline.income")}
              </th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.fromAge} className="border-t border-slate-100 align-top">
                <td className="py-2 pe-3 tabular-nums">
                  <span dir="ltr">{formatRange(segment.fromAge, segment.toAge)}</span>
                  {spouseAgeAt && (
                    <span className="block text-xs text-slate-500">
                      {t("projections.timeline.spouseAges")}{" "}
                      <span dir="ltr">
                        {formatRange(spouseAgeAt(segment.fromAge), spouseAgeAt(segment.toAge))}
                      </span>
                    </span>
                  )}
                </td>
                <td className="py-2 pe-3">
                  <div className="flex flex-col gap-1.5">
                    {SPLIT_GROUPS.map(({ key, heading, hatched }) => {
                      const bands = segment.bands.filter((band) => (segment[key][band] ?? 0) > 0);
                      if (bands.length === 0) return null;
                      return (
                        <div key={key}>
                          <p className="text-xs font-medium text-slate-600">{t(heading)}</p>
                          <ul className="flex flex-col gap-0.5">
                            {bands.map((band) => (
                              <li key={band} className="flex items-center gap-2">
                                <BandSwatch band={band} hatched={hatched} />
                                <span>{labels[band]}</span>
                                <span className="text-slate-500 tabular-nums">
                                  {currencySymbol}
                                  {formatNumber(segment[key][band] ?? 0)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {segment.bands.length === 0 && segment.unfunded !== undefined && (
                      <p className="text-xs text-slate-500">{t("projections.timeline.nothingPays")}</p>
                    )}
                  </div>
                </td>
                <td className="py-2 font-medium tabular-nums">
                  {currencySymbol}
                  {formatNumber(segment.monthlyIncome)}
                  {segment.unfunded !== undefined && (
                    <span className="block text-xs font-semibold text-rose-700">
                      {t("projections.cashFlow.unfunded")} {currencySymbol}
                      {formatNumber(Math.round(segment.unfunded))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
