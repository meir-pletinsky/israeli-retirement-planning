import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { useIsraelCpi, type CpiStatus } from "../../cpi/useIsraelCpi";

const STATUS_KEYS: Record<CpiStatus, string> = {
  live: "statusLive",
  loading: "statusLoading",
  unavailable: "statusUnavailable",
  off: "statusOff",
};

const roundToTenth = (pct: number) => Math.round(pct * 10) / 10;

/** Recent Israeli inflation next to the inflation field, each figure one tap away from being used. */
export function InflationReference() {
  const { t, i18n } = useTranslation();
  const { profile, updateProfile, cpiLookupEnabled } = useProfile();
  const { assumptions } = profile;
  const { summary, status } = useIsraelCpi(cpiLookupEnabled);

  const percent = (value: number) =>
    `${value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const month = new Date(Date.UTC(summary.latest.year, summary.latest.month - 1, 1)).toLocaleDateString(
    i18n.language,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  const rows = [
    {
      key: "last12",
      label: t("myData.steps.assumptions.cpi.last12", { month }),
      pct: summary.latest.yearOverYearPct,
    },
    ...summary.averages.map(({ years, pct }) => ({
      key: `average-${years}`,
      label: t("myData.steps.assumptions.cpi.average", { years, count: years }),
      pct,
    })),
  ];

  return (
    <div className="flex flex-col gap-2 rounded-md bg-slate-50 p-3">
      <div>
        <h3 className="text-sm font-medium text-slate-700">{t("myData.steps.assumptions.cpi.title")}</h3>
        <p className="text-xs text-slate-500">{t("myData.steps.assumptions.cpi.subtitle")}</p>
      </div>
      <ul className="flex flex-col divide-y divide-slate-200">
        {rows.map((row) => {
          const value = roundToTenth(row.pct);
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="text-slate-600">{row.label}</span>
              <span className="flex items-center gap-3">
                <span className="font-medium text-slate-900">{percent(value)}</span>
                {assumptions.inflationPct === value ? (
                  <span className="w-24 text-center text-xs text-slate-500">
                    {t("myData.steps.assumptions.cpi.inUse")}
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={t("myData.steps.assumptions.cpi.useAria", {
                      value: percent(value),
                      label: row.label,
                    })}
                    onClick={() => updateProfile({ assumptions: { ...assumptions, inflationPct: value } })}
                    className="w-24 rounded-md border border-slate-300 px-2 py-0.5 text-center text-xs font-medium text-brand-700 hover:bg-white"
                  >
                    {t("myData.steps.assumptions.cpi.use")}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p role="status" className="text-xs text-slate-500">
        {t(`myData.steps.assumptions.cpi.${STATUS_KEYS[status]}`, { month })}
      </p>
    </div>
  );
}
