import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  BITUACH_LEUMI_RATES,
  type BituachLeumiEstimate,
  mayQualifyForIncomeSupplement,
} from "../domain";

interface BituachLeumiCardProps {
  estimate: BituachLeumiEstimate;
  /** Total estimated monthly retirement income, used for the income-supplement hint. */
  monthlyIncomeTodayMoney: number;
}

const percent = (fraction: number) => Math.round(fraction * 100);

/** ISO date (2026-01-01) to the day-first format used in Israel (01.01.2026). */
const formatEffectiveDate = (iso: string) => iso.split("-").reverse().join(".");

export function BituachLeumiCard({ estimate, monthlyIncomeTodayMoney }: BituachLeumiCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const { included, eligible, source, monthlyPension } = estimate;

  const formatAge = (age: number) => {
    const years = Math.floor(age + 1e-9);
    const months = Math.round((age - years) * 12);
    return months === 0
      ? t("dashboard.bituachLeumi.ageYears", { years })
      : t("dashboard.bituachLeumi.ageYearsMonths", { years, months });
  };

  const settingsLink = (
    <Link to="/my-data/personal" className="font-medium text-teal-700 hover:underline">
      {t("dashboard.bituachLeumi.editSettings")}
    </Link>
  );

  return (
    <section
      aria-labelledby="bituach-leumi-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="bituach-leumi-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.bituachLeumi.title")}
      </h2>

      {!included && (
        <p className="mt-2 text-sm text-slate-600">
          {t("dashboard.bituachLeumi.excluded")} {settingsLink}
        </p>
      )}

      {included && !eligible && (
        <p className="mt-2 text-sm text-amber-800">
          {t("dashboard.bituachLeumi.notEligible", {
            lifetime: BITUACH_LEUMI_RATES.qualifyingLifetimeMonths,
            recent: BITUACH_LEUMI_RATES.qualifyingRecentMonths,
          })}{" "}
          {settingsLink}
        </p>
      )}

      {included && eligible && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {t("dashboard.bituachLeumi.monthlyPension", {
              amount: `${currencySymbol}${monthlyPension.toLocaleString()}`,
            })}
          </p>
          <p className="text-sm text-slate-600">
            {t("dashboard.bituachLeumi.startsAt", { age: formatAge(estimate.claimAge) })}
          </p>
          {source === "override" ? (
            <p className="text-sm text-slate-600">{t("dashboard.bituachLeumi.usingOverride")}</p>
          ) : (
            <>
              {estimate.seniorityRate > 0 && (
                <p className="text-sm text-slate-600">
                  {t("dashboard.bituachLeumi.seniority", { percent: percent(estimate.seniorityRate) })}
                </p>
              )}
              {estimate.deferralRate > 0 && (
                <p className="text-sm text-slate-600">
                  {t("dashboard.bituachLeumi.deferral", {
                    percent: percent(estimate.deferralRate),
                    age: formatAge(estimate.statutoryRetirementAge),
                  })}
                </p>
              )}
            </>
          )}
          {mayQualifyForIncomeSupplement(monthlyIncomeTodayMoney) && (
            <p className="mt-1 text-sm text-slate-700">
              {t("dashboard.bituachLeumi.incomeSupplementHint", {
                amount: `${currencySymbol}${BITUACH_LEUMI_RATES.incomeSupplementGuaranteeSingleUnder70.toLocaleString()}`,
              })}
            </p>
          )}
        </div>
      )}

      {included && (
        <p className="mt-3 text-xs text-slate-500">
          {t("dashboard.bituachLeumi.ratesAsOf", {
            date: formatEffectiveDate(BITUACH_LEUMI_RATES.effectiveDate),
          })}{" "}
          <a
            href={BITUACH_LEUMI_RATES.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 hover:underline"
          >
            {t("dashboard.bituachLeumi.source")}
          </a>
        </p>
      )}
    </section>
  );
}
