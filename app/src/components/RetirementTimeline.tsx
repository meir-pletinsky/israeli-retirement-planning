import { useTranslation } from "react-i18next";

import type { IncomeBandKey, TimelineSegment } from "../domain";
import { INCOME_BAND_COLORS } from "./charts/incomeBandColors";

interface RetirementTimelineProps {
  segments: TimelineSegment[];
  labels: Record<IncomeBandKey, string>;
  currencySymbol: string;
  /** For a couple: the spouse's age when the primary user is the given age. */
  spouseAgeAt?: (selfAge: number) => number;
}

export function RetirementTimeline({
  segments,
  labels,
  currencySymbol,
  spouseAgeAt,
}: RetirementTimelineProps) {
  const { t } = useTranslation();
  const formatRange = (from: number, to: number) =>
    from === to ? String(from) : t("projections.timeline.range", { from, to });

  return (
    <section
      aria-labelledby="retirement-timeline-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="retirement-timeline-title" className="text-sm font-semibold text-slate-700">
        {t("projections.timeline.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("projections.timeline.intro")}</p>
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
                  <ul className="flex flex-col gap-0.5">
                    {segment.bands.map((band) => (
                      <li key={band} className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: INCOME_BAND_COLORS[band] }}
                        />
                        <span>{labels[band]}</span>
                        <span className="text-slate-500 tabular-nums">
                          {currencySymbol}
                          {(segment.amounts[band] ?? 0).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-2 font-medium tabular-nums">
                  {currencySymbol}
                  {segment.monthlyIncome.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
