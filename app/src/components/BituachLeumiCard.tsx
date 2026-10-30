import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import {
  BITUACH_LEUMI_RATES,
  type BituachLeumiEstimate,
  type HouseholdMemberEstimate,
  mayQualifyForIncomeSupplement,
} from "../domain";

interface BituachLeumiCardProps {
  /** The primary user first, then the spouse when the plan covers one. */
  members: HouseholdMemberEstimate[];
  /** Total estimated monthly retirement income, used for the income-supplement hint. */
  monthlyIncomeTodayMoney: number;
}

const percent = (fraction: number) => Math.round(fraction * 100);

/** ISO date (2026-01-01) to the day-first format used in Israel (01.01.2026). */
const formatEffectiveDate = (iso: string) => iso.split("-").reverse().join(".");

export function BituachLeumiCard({ members, monthlyIncomeTodayMoney }: BituachLeumiCardProps) {
  const { t } = useTranslation();
  const isCouple = members.length > 1;
  const anyIncluded = members.some((member) => member.bituachLeumi.included);
  const anyPaid = members.some(
    ({ bituachLeumi }) => bituachLeumi.included && bituachLeumi.eligible,
  );
  const currencySymbol = t("common.currencySymbol");
  const guarantee = isCouple
    ? BITUACH_LEUMI_RATES.incomeSupplementGuaranteeCouple
    : BITUACH_LEUMI_RATES.incomeSupplementGuaranteeSingleUnder70;

  return (
    <section
      aria-labelledby="bituach-leumi-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="bituach-leumi-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.bituachLeumi.title")}
      </h2>

      {isCouple && (
        <p className="mt-1 text-xs text-slate-500">{t("dashboard.bituachLeumi.ownAges")}</p>
      )}

      <div className="mt-2 flex flex-col gap-4">
        {members.map(({ role, bituachLeumi }) => (
          <MemberPension
            key={role}
            estimate={bituachLeumi}
            heading={isCouple ? t(`dashboard.bituachLeumi.member.${role}`) : null}
          />
        ))}
      </div>

      {anyPaid && mayQualifyForIncomeSupplement(monthlyIncomeTodayMoney, isCouple) && (
        <p className="mt-3 text-sm text-slate-700">
          {t("dashboard.bituachLeumi.incomeSupplementHint", {
            amount: `${currencySymbol}${guarantee.toLocaleString()}`,
          })}
        </p>
      )}

      {anyIncluded && (
        <p className="mt-3 text-xs text-slate-500">
          {t("dashboard.bituachLeumi.ratesAsOf", {
            date: formatEffectiveDate(BITUACH_LEUMI_RATES.effectiveDate),
          })}{" "}
          <a
            href={BITUACH_LEUMI_RATES.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-brand-700 hover:underline"
          >
            {t("dashboard.bituachLeumi.source")}
          </a>
        </p>
      )}
    </section>
  );
}

function MemberPension({
  estimate,
  heading,
}: {
  estimate: BituachLeumiEstimate;
  /** Names whose pension this is; null when there is only one person. */
  heading: string | null;
}) {
  const { t } = useTranslation();
  const currencySymbol = t("common.currencySymbol");
  const { included, eligible, source, monthlyPension, spouseSupplement } = estimate;
  const money = (amount: number) => `${currencySymbol}${amount.toLocaleString()}`;

  const formatAge = (age: number) => {
    const years = Math.floor(age + 1e-9);
    const months = Math.round((age - years) * 12);
    return months === 0
      ? t("dashboard.bituachLeumi.ageYears", { years })
      : t("dashboard.bituachLeumi.ageYearsMonths", { years, months });
  };

  const settingsLink = (
    <Link to="/my-data/personal" className="font-medium text-brand-700 hover:underline">
      {t("dashboard.bituachLeumi.editSettings")}
    </Link>
  );

  return (
    <div className="flex flex-col gap-1">
      {heading && <h3 className="text-sm font-medium text-slate-800">{heading}</h3>}

      {!included && (
        <p className="text-sm text-slate-600">
          {t("dashboard.bituachLeumi.excluded")} {settingsLink}
        </p>
      )}

      {included && !eligible && (
        <p className="text-sm text-amber-800">
          {t("dashboard.bituachLeumi.notEligible", {
            lifetime: BITUACH_LEUMI_RATES.qualifyingLifetimeMonths,
            recent: BITUACH_LEUMI_RATES.qualifyingRecentMonths,
          })}{" "}
          {settingsLink}
        </p>
      )}

      {included && eligible && (
        <>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {t("dashboard.bituachLeumi.monthlyPension", { amount: money(monthlyPension) })}
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
          {spouseSupplement && (
            <p className="text-sm text-slate-600">
              {spouseSupplement.endAge === null
                ? t("dashboard.bituachLeumi.spouseSupplement", {
                    amount: money(spouseSupplement.monthly),
                    start: formatAge(spouseSupplement.startAge),
                  })
                : t("dashboard.bituachLeumi.spouseSupplementUntil", {
                    amount: money(spouseSupplement.monthly),
                    start: formatAge(spouseSupplement.startAge),
                    end: formatAge(spouseSupplement.endAge),
                  })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
