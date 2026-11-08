import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { DEFAULT_RETIREMENT_AGE, type DataGap, type DataGapId, type DataGapStep } from "../domain";
import { RETIREMENT_AGE_TARGET } from "./retirementAgeTargets";

interface DataGapsCardProps {
  gaps: DataGap[];
  /** The age the plan runs to; pension accounts without a conversion factor are spent by then. */
  horizonAge: number;
}

const STEP_LABEL_KEYS: Record<DataGapStep, string> = {
  personal: "myData.steps.personal.label",
  "pension-savings": "myData.steps.pensionSavings.label",
  equity: "myData.steps.equity.label",
  expenses: "myData.steps.expenses.label",
};

/** Gaps that open the page at their own field rather than at the top of the step. */
const FIELD_TARGETS: Partial<Record<DataGapId, string>> = {
  retirementAge: RETIREMENT_AGE_TARGET.self,
  spouseRetirementAge: RETIREMENT_AGE_TARGET.spouse,
};

/** Optional inputs that are missing and would change the estimate, each linking to where it is entered. */
export function DataGapsCard({ gaps, horizonAge }: DataGapsCardProps) {
  const { t } = useTranslation();

  if (gaps.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="data-gaps-title"
      className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 shadow-sm"
    >
      <h2 id="data-gaps-title" className="text-base font-semibold text-slate-900">
        {t("dashboard.gaps.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.gaps.intro")}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {gaps.map((gap) => (
          <li key={gap.id} className="flex flex-col gap-0.5 text-sm text-slate-700 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <span>
              {t(`dashboard.gaps.items.${gap.id}`, {
                count: gap.count,
                age: DEFAULT_RETIREMENT_AGE,
                horizon: horizonAge,
              })}
            </span>
            <Link
              to={FIELD_TARGETS[gap.id] ?? `/my-data/${gap.step}`}
              className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
            >
              {t("dashboard.gaps.goTo", { step: t(STEP_LABEL_KEYS[gap.step]) })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
