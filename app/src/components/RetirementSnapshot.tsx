import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { RetirementKpis } from "../domain";
import { IncomeComposition } from "./IncomeComposition";
import { KpiCard } from "./KpiCard";
import { useFormatAge } from "./useFormatAge";

const isolate = (text: string) => `\u2066${text}\u2069`;

interface RetirementSnapshotProps {
  kpis: RetirementKpis;
  /** What irregular costs (paid yearly or less often) add to the planned monthly spending, averaged. */
  irregularMonthly?: number;
}

export function RetirementSnapshot({ kpis, irregularMonthly }: RetirementSnapshotProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${Math.round(amount).toLocaleString()}`;
  const { plannedMonthlySpending, withdrawalRate, incomeComposition, access } = kpis;

  return (
    <section aria-labelledby="retirement-snapshot-title" className="flex flex-col gap-3">
      <div>
        <h2 id="retirement-snapshot-title" className="text-sm font-semibold text-slate-700">
          {t("dashboard.snapshot.title")}
        </h2>
        <p className="text-xs text-slate-500">{t("dashboard.snapshot.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiCard
          label={t("dashboard.snapshot.plannedSpending")}
          value={plannedMonthlySpending === null ? "—" : money(plannedMonthlySpending)}
          note={
            plannedMonthlySpending === null ? (
              t("dashboard.snapshot.noSpending")
            ) : irregularMonthly ? (
              <div className="flex flex-col gap-1">
                <p>{t("dashboard.irregular.snapshotNote", { amount: isolate(money(irregularMonthly)) })}</p>
                <Link to="/projections#irregular-costs" className="font-medium text-brand-700 hover:underline">
                  {t("dashboard.irregular.snapshotLink")}
                </Link>
              </div>
            ) : undefined
          }
        />
        <KpiCard
          label={t("dashboard.snapshot.withdrawalRate")}
          value={
            withdrawalRate === null
              ? "—"
              : withdrawalRate.toLocaleString(undefined, {
                  style: "percent",
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })
          }
          note={t(
            withdrawalRate === null
              ? "dashboard.snapshot.withdrawalRateUnavailable"
              : "dashboard.snapshot.withdrawalRateNote",
          )}
        />
        <KpiCard
          label={t("dashboard.snapshot.availableFunds")}
          value={money(access.accessibleAtRetirement)}
          note={
            access.lockedAtRetirement > 0 && access.nextUnlockAge !== null
              ? t("dashboard.snapshot.lockedNote", {
                  amount: money(access.lockedAtRetirement),
                  age: formatAge(access.nextUnlockAge),
                })
              : undefined
          }
        />
      </div>
      <IncomeComposition
        stages={incomeComposition}
        endAge={kpis.horizonAge}
        continuingMonthly={kpis.continuingPaymentsMonthly}
      />
    </section>
  );
}
