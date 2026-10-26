import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { RetirementFeasibility } from "../domain";

interface FeasibilityCardProps {
  feasibility: RetirementFeasibility;
  maxSearchAge: number;
}

export function FeasibilityCard({ feasibility, maxSearchAge }: FeasibilityCardProps) {
  const { t } = useTranslation();
  const { status, earliestAge, yearsFromNow } = feasibility;
  const yearsLabel = yearsFromNow === null ? null : Math.round(yearsFromNow);

  return (
    <section
      aria-labelledby="feasibility-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="feasibility-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.feasibility.title")}
      </h2>

      {status === "feasible" && earliestAge !== null && yearsLabel !== null && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {t("dashboard.feasibility.earliestAge", { age: earliestAge })}
          </p>
          <p className="text-sm text-slate-600">
            {yearsLabel === 0
              ? t("dashboard.feasibility.feasibleNow")
              : t("dashboard.feasibility.yearsFromNow", { years: yearsLabel })}
          </p>
        </div>
      )}

      {status === "notFeasible" && (
        <p className="mt-2 text-sm text-amber-800">
          {t("dashboard.feasibility.notFeasible", { age: maxSearchAge })}
        </p>
      )}

      {status === "noTarget" && (
        <p className="mt-2 text-sm text-slate-600">
          {t("dashboard.feasibility.noTarget")}{" "}
          <Link
            to="/my-data/expenses"
            className="font-medium text-teal-700 hover:underline"
          >
            {t("dashboard.feasibility.noTargetCta")}
          </Link>
        </p>
      )}
    </section>
  );
}
