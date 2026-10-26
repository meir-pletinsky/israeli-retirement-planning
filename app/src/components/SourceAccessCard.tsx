import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ACCESS_RULES, type RetirementAccessSummary } from "../domain";

interface SourceAccessCardProps {
  access: RetirementAccessSummary;
}

/** ISO date (2026-10-26) to the day-first format used in Israel (26.10.2026). */
const formatAsOf = (iso: string) => iso.split("-").reverse().join(".");

/** Whether there is anything about access timing worth telling the user. */
function hasAccessNotes(access: RetirementAccessSummary): boolean {
  return (
    access.bridgeLimited ||
    access.lockedAtRetirement > 0 ||
    access.accountAnnuityMonthly > 0 ||
    access.uncategorizedAccounts > 0
  );
}

export function SourceAccessCard({ access }: SourceAccessCardProps) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");

  if (!hasAccessNotes(access)) {
    return null;
  }

  const money = (amount: number) => `${currencySymbol}${Math.round(amount).toLocaleString()}`;
  const formatAge = (age: number) => {
    const years = Math.floor(age + 1e-9);
    const months = Math.round((age - years) * 12);
    return months === 0
      ? t("dashboard.sourceAccess.ageYears", { years })
      : t("dashboard.sourceAccess.ageYearsMonths", { years, months });
  };

  return (
    <section
      aria-labelledby="source-access-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="source-access-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.sourceAccess.title")}
      </h2>

      <div className="mt-2 flex flex-col gap-1 text-sm text-slate-600">
        {access.lockedAtRetirement > 0 && access.nextUnlockAge !== null && (
          <>
            <p>
              {t("dashboard.sourceAccess.accessible", {
                amount: money(access.accessibleAtRetirement),
              })}
            </p>
            <p>
              {t("dashboard.sourceAccess.locked", {
                amount: money(access.lockedAtRetirement),
                age: formatAge(access.nextUnlockAge),
              })}
            </p>
          </>
        )}

        {access.accountAnnuityMonthly > 0 && (
          <p>
            {t("dashboard.sourceAccess.annuities", {
              amount: money(access.accountAnnuityMonthly),
            })}
          </p>
        )}
      </div>

      {access.bridgeLimited && access.limitingAge !== null && (
        <p role="status" className="mt-3 text-sm text-amber-800">
          {t("dashboard.sourceAccess.bridgeLimited", {
            age: formatAge(access.limitingAge),
            income: money(access.unconstrainedMonthlyIncome),
          })}
        </p>
      )}

      {access.uncategorizedAccounts > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          {t("dashboard.sourceAccess.uncategorized", { count: access.uncategorizedAccounts })}{" "}
          <Link to="/my-data/pension-savings" className="font-medium text-teal-700 hover:underline">
            {t("dashboard.sourceAccess.editAccounts")}
          </Link>
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {t("dashboard.sourceAccess.rulesAsOf", { date: formatAsOf(ACCESS_RULES.asOf) })}
      </p>
    </section>
  );
}
