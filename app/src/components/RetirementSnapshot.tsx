import { useTranslation } from "react-i18next";

import type { RetirementKpis } from "../domain";
import { KpiCard } from "./KpiCard";
import { useFormatAge } from "./useFormatAge";

interface RetirementSnapshotProps {
  kpis: RetirementKpis;
}

export function RetirementSnapshot({ kpis }: RetirementSnapshotProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const currencySymbol = t("common.currencySymbol");
  const money = (amount: number) => `${currencySymbol}${Math.round(amount).toLocaleString()}`;
  const { plannedMonthlySpending, withdrawalRate, pension, stateBenefits, access } = kpis;

  const startsAt = (income: { monthly: number; fromAge: number | null }) =>
    income.monthly > 0 && income.fromAge !== null
      ? t("dashboard.snapshot.fromAge", { age: formatAge(income.fromAge) })
      : t("dashboard.snapshot.none");

  return (
    <section aria-labelledby="retirement-snapshot-title" className="flex flex-col gap-3">
      <div>
        <h2 id="retirement-snapshot-title" className="text-sm font-semibold text-slate-700">
          {t("dashboard.snapshot.title")}
        </h2>
        <p className="text-xs text-slate-500">{t("dashboard.snapshot.subtitle")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={t("dashboard.snapshot.plannedSpending")}
          value={plannedMonthlySpending === null ? "—" : money(plannedMonthlySpending)}
          note={plannedMonthlySpending === null ? t("dashboard.snapshot.noSpending") : undefined}
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
          note={t("dashboard.snapshot.withdrawalRateNote")}
        />
        <KpiCard
          label={t("dashboard.snapshot.pension")}
          value={pension.monthly > 0 ? money(pension.monthly) : "—"}
          note={startsAt(pension)}
        />
        <KpiCard
          label={t("dashboard.snapshot.stateBenefits")}
          value={stateBenefits.monthly > 0 ? money(stateBenefits.monthly) : "—"}
          note={startsAt(stateBenefits)}
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
    </section>
  );
}
