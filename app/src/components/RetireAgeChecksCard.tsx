import clsx from "clsx";
import { useTranslation } from "react-i18next";

import type { RetirementAgeCheck } from "../domain";

interface RetireAgeChecksCardProps {
  checks: RetirementAgeCheck[];
}

export function RetireAgeChecksCard({ checks }: RetireAgeChecksCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) =>
    `${currencySymbol}${Math.abs(Math.round(amount)).toLocaleString()}`;

  return (
    <section
      aria-labelledby="retire-checks-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="retire-checks-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.retireChecks.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.retireChecks.subtitle")}</p>

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {checks.map((check) => {
          const isOnTrack = check.status === "onTrack";
          return (
            <li
              key={check.age}
              className={clsx(
                "rounded-lg border p-3",
                isOnTrack ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50",
              )}
            >
              <p className="text-xs font-medium text-slate-600">
                {check.isNow
                  ? t("dashboard.retireChecks.now", { age: check.age })
                  : t("dashboard.retireChecks.atAge", { age: check.age })}
              </p>
              <p
                className={clsx(
                  "mt-1 text-lg font-semibold",
                  isOnTrack ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {isOnTrack
                  ? t("dashboard.retireChecks.onTrack")
                  : t("dashboard.retireChecks.shortfall")}
              </p>
              <p className="text-xs tabular-nums text-slate-600">
                {isOnTrack
                  ? t("dashboard.retireChecks.surplus", { amount: money(check.monthlyGap) })
                  : t("dashboard.retireChecks.short", { amount: money(check.monthlyGap) })}
              </p>
              {check.spouseAge !== null && (
                <p className="mt-1 text-xs text-slate-500">
                  {t("dashboard.retireChecks.spouseAge", { age: Math.round(check.spouseAge) })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
