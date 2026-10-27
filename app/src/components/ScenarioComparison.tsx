import clsx from "clsx";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../app/ProfileContext";
import {
  COMPARISON_MAX_AGE,
  COMPARISON_MIN_AGE,
  type RetirementAgeOutcome,
  compareRetirementAge,
  initialComparisonAges,
  isHouseholdActive,
  isValidComparisonAge,
  resolveCurrentAge,
  resolveRetirementAge,
} from "../domain";
import type { ProfileData } from "../types";
import { ComparisonChart } from "./charts/ComparisonChart";
import { NumberField } from "./fields/NumberField";

interface ScenarioComparisonProps {
  profile: ProfileData;
}

/** Side-by-side outcomes for three freely chosen retirement ages. */
export function ScenarioComparison({ profile }: ScenarioComparisonProps) {
  const { t } = useTranslation();
  const { updateProfile } = useProfile();
  const [ages, setAges] = useState<(number | null)[]>(() => initialComparisonAges(profile));
  const currencySymbol = t("common.currencySymbol");
  const isCouple = isHouseholdActive(profile);
  const planAge = resolveRetirementAge(profile, "standard");
  const minAge = Math.max(COMPARISON_MIN_AGE, Math.ceil(resolveCurrentAge(profile)));

  const changeAge = (index: number, next: number | null) => {
    const nextAges = ages.map((current, i) => (i === index ? next : current));
    setAges(nextAges);
    // Keep the choice only while every column is usable, so a half-typed age is never saved.
    if (nextAges.every((age) => isValidComparisonAge(profile, age))) {
      updateProfile({ comparisonAges: nextAges as [number, number, number] });
    }
  };

  const money = (amount: number) =>
    `${amount < 0 ? "-" : ""}${currencySymbol}${Math.abs(amount).toLocaleString()}`;

  const columns = ages.map((age) => ({
    age,
    outcome: isValidComparisonAge(profile, age) ? compareRetirementAge(profile, age) : null,
  }));
  const noTarget = (profile.expenses.retirementMonthly ?? 0) <= 0;
  const chartData = columns.flatMap(({ outcome }, index) =>
    outcome && columns.findIndex((column) => column.age === outcome.retirementAge) === index
      ? [{ age: outcome.retirementAge, netMonthly: outcome.netMonthlyIncome }]
      : [],
  );

  type Row = {
    key: string;
    label: string;
    cell: (outcome: RetirementAgeOutcome) => ReactNode;
    emphasis?: boolean;
  };
  const rows: Row[] = [
    { key: "retireAt", label: t("projections.compare.retireAt"), cell: (o) => o.retirementAge },
    ...(isCouple
      ? [
          {
            key: "spouseRetireAt",
            label: t("projections.compare.spouseRetireAt"),
            cell: (o: RetirementAgeOutcome) => o.spouseRetirementAge,
          },
        ]
      : []),
    {
      key: "yearsFromNow",
      label: t("projections.compare.yearsFromNow"),
      cell: (o) => Math.round(o.yearsFromNow * 10) / 10,
    },
    {
      key: "savings",
      label: t("projections.compare.savings"),
      cell: (o) => money(o.netWorthAtRetirement),
    },
    { key: "gross", label: t("projections.compare.gross"), cell: (o) => money(o.grossMonthlyIncome) },
    { key: "tax", label: t("projections.compare.tax"), cell: (o) => money(o.taxMonthly) },
    {
      key: "net",
      label: t("projections.compare.net"),
      cell: (o) => money(o.netMonthlyIncome),
      emphasis: true,
    },
    ...(!noTarget
      ? [
          {
            key: "expenses",
            label: t("projections.compare.expenses"),
            cell: (o: RetirementAgeOutcome) => money(o.desiredMonthlyExpenses),
          },
          {
            key: "gap",
            label: t("projections.compare.gap"),
            emphasis: true,
            cell: (o: RetirementAgeOutcome) =>
              o.monthlyGap === null ? null : (
                <>
                  <span dir="ltr">{money(o.monthlyGap)}</span>{" "}
                  <span
                    className={clsx(
                      "text-xs font-medium",
                      o.status === "onTrack" ? "text-emerald-700" : "text-red-600",
                    )}
                  >
                    {o.status === "onTrack"
                      ? t("projections.compare.statusOnTrack")
                      : t("projections.compare.statusShortfall")}
                  </span>
                </>
              ),
          },
        ]
      : []),
  ];

  return (
    <section
      aria-labelledby="compare-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="compare-title" className="text-sm font-semibold text-slate-700">
        {t("projections.compare.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("projections.compare.intro")}</p>
      {isCouple && (
        <p className="mt-1 text-xs text-slate-500">{t("projections.compare.coupleNote")}</p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ages.map((age, index) => (
          <NumberField
            key={index}
            label={t("projections.compare.ageLabel", { index: index + 1 })}
            suffix={t("projections.compare.ageSuffix")}
            value={age}
            min={minAge}
            max={COMPARISON_MAX_AGE}
            onChange={(next) => changeAge(index, next)}
            error={
              isValidComparisonAge(profile, age)
                ? undefined
                : t("projections.compare.ageError", { min: minAge, max: COMPARISON_MAX_AGE })
            }
          />
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <caption className="sr-only">{t("projections.compare.tableLabel")}</caption>
          <thead>
            <tr>
              <td />
              {columns.map(({ age, outcome }, index) => (
                <th
                  key={index}
                  scope="col"
                  className="px-2 py-1 text-start text-xs font-semibold text-slate-700"
                >
                  {outcome ? t("projections.compare.ageColumn", { age: outcome.retirementAge }) : "-"}
                  {age === planAge && outcome && (
                    <span className="mt-0.5 block w-fit rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                      {t("projections.compare.yourPlan")}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, label, cell, emphasis }) => (
              <tr key={key} className="border-t border-slate-100">
                <th scope="row" className="px-2 py-1.5 text-start text-sm font-normal text-slate-600">
                  {label}
                </th>
                {columns.map(({ outcome }, index) => (
                  <td
                    key={index}
                    className={clsx(
                      "px-2 py-1.5 tabular-nums",
                      emphasis ? "font-semibold text-slate-900" : "text-slate-800",
                    )}
                  >
                    {outcome ? cell(outcome) : "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {chartData.length > 0 && (
        <div className="mt-4">
          <ComparisonChart
            data={chartData}
            target={noTarget ? null : (profile.expenses.retirementMonthly ?? null)}
            planAge={planAge}
            currencySymbol={currencySymbol}
            netLabel={t("projections.compare.net")}
            targetLabel={t("projections.compare.expenses")}
          />
        </div>
      )}

      {noTarget && <p className="mt-3 text-xs text-slate-500">{t("projections.compare.noTarget")}</p>}
      <p className="mt-3 text-xs text-slate-500">{t("projections.compare.footnote")}</p>
    </section>
  );
}
