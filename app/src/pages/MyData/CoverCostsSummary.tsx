import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { useFormatAge } from "../../components/useFormatAge";
import { buildHousehold, resolveRetirementTiming } from "../../domain";
import { EXPENSES } from "./expenseLabels";
import { formatCurrency } from "./summaryFormat";

const COVER = `${EXPENSES}.coverCosts`;

/**
 * What the plan assumes the household pays for survivors' cover, read from the
 * same household the projections use. It is shown here because it is spending,
 * but it is edited under the person's cover plan (Personal), so it has no inputs.
 */
export function CoverCostsSummary() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const formatAge = useFormatAge();
  const currency = t("common.currencySymbol");

  const costs = useMemo(
    () =>
      buildHousehold(profile, resolveRetirementTiming(profile, "standard")).members.flatMap((member) =>
        member.coverCost ? [{ role: member.role, cost: member.coverCost }] : [],
      ),
    [profile],
  );
  if (costs.length === 0) return null;

  return (
    <section
      aria-labelledby="expenses-cover-title"
      data-testid="expenses-cover-costs"
      className="max-w-lg rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <h2 id="expenses-cover-title" className="text-base font-semibold text-slate-900">
        {t(`${COVER}.title`)}
      </h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm text-slate-700">
        {costs.map(({ role, cost }) => (
          <li key={role}>
            <span className="font-medium">{t(`projections.cover.person.${role}`)}</span>
            {": "}
            {t(`${COVER}.line`, {
              option: t(`projections.cover.option.${cost.option}`),
              amount: formatCurrency(Math.round(cost.monthly), currency),
              from: formatAge(cost.startAge),
              to: formatAge(cost.endAge),
            })}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-600">{t(`${COVER}.note`)}</p>
    </section>
  );
}
