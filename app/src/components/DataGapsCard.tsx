import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { DataGap, DataGapStep } from "../domain";

interface DataGapsCardProps {
  gaps: DataGap[];
}

const STEP_LABEL_KEYS: Record<DataGapStep, string> = {
  personal: "myData.steps.personal.label",
  "pension-savings": "myData.steps.pensionSavings.label",
  expenses: "myData.steps.expenses.label",
};

/** Optional inputs that are missing and would change the estimate, each linking to where it is entered. */
export function DataGapsCard({ gaps }: DataGapsCardProps) {
  const { t } = useTranslation();

  if (gaps.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="data-gaps-title"
      className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm"
    >
      <h2 id="data-gaps-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.gaps.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.gaps.intro")}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {gaps.map((gap) => (
          <li key={gap.id} className="flex flex-col gap-0.5 text-sm text-slate-700 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <span>{t(`dashboard.gaps.items.${gap.id}`, { count: gap.count })}</span>
            <Link
              to={`/my-data/${gap.step}`}
              className="shrink-0 text-xs font-medium text-teal-700 hover:underline"
            >
              {t("dashboard.gaps.goTo", { step: t(STEP_LABEL_KEYS[gap.step]) })}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
