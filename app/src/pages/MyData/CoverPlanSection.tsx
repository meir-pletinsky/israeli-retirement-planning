import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { CheckboxField } from "../../components/fields/CheckboxField";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import { useFormatAge } from "../../components/useFormatAge";
import { ACCESS_RULES } from "../../domain/accessRules";
import { analyseCover } from "../../domain/coverAnalysis";
import { coverOnFile } from "../../domain/coverPlan";
import { COVER_OPTIONS, createCoverPlan, type CoverOption, type CoverPlan } from "../../types";
import type { Person } from "./activePerson";
import { formatCurrency } from "./summaryFormat";

const UNDECIDED = "undecided";
const oneDecimal = (value: number) => String(Math.round(value * 10) / 10);

interface CoverPlanSectionProps {
  /** Whose cover it is: the person who stops working and whose death cover lapses. */
  person: Person;
}

/** Where the user chooses how to handle the survivors' cover that lapses when the deposits stop. */
export function CoverPlanSection({ person }: CoverPlanSectionProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  const { profile, updateProfile } = useProfile();
  const currency = t("common.currencySymbol");
  const owner = person === "spouse" ? "Spouse" : "Self";
  const plan = person === "spouse" ? profile.spouse.coverPlan : profile.personal.coverPlan;
  const onFile = coverOnFile(profile, person);
  const analysis = onFile.hasCover ? analyseCover(profile, person) : null;
  const money = (value: number) => formatCurrency(Math.round(value), currency);

  const savePlan = (next: CoverPlan | null) =>
    updateProfile(
      person === "spouse"
        ? { spouse: { ...profile.spouse, coverPlan: next } }
        : { personal: { ...profile.personal, coverPlan: next } },
    );
  const change = (changes: Partial<CoverPlan>) => {
    if (plan) savePlan({ ...plan, ...changes });
  };

  const costHelper =
    plan?.option === "termLife"
      ? t("cover.section.monthlyCostTermHelper")
      : onFile.monthlyRiskDeduction > 0
        ? t("cover.section.monthlyCostKeepHelper", { amount: money(onFile.monthlyRiskDeduction) })
        : t("cover.section.monthlyCostKeepHelperUnknown");

  return (
    <CollapsibleSection title={t(`cover.section.title${owner}`)}>
      <p className="text-sm text-slate-600">{t(`cover.section.intro${owner}`)}</p>

      <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-medium">{t("cover.section.onFileTitle")}</p>
        {onFile.hasCover ? (
          <ul className="mt-1 list-disc ps-5">
            {onFile.deathCoverage > 0 && (
              <li>
                {t("cover.section.onFileDeath")}: <span dir="ltr">{money(onFile.deathCoverage)}</span>
              </li>
            )}
            {onFile.monthlySurvivorsPension > 0 && (
              <li>
                {t("cover.section.onFileSurvivors")}:{" "}
                <span dir="ltr">{money(onFile.monthlySurvivorsPension)}</span>
              </li>
            )}
            {onFile.monthlyRiskDeduction > 0 && (
              <li>
                {t("cover.section.onFileRisk")}: <span dir="ltr">{money(onFile.monthlyRiskDeduction)}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-1">{t("cover.section.onFileNone")}</p>
        )}
        {onFile.hasCover && <p className="mt-1 text-xs text-slate-500">{t("cover.section.onFileNote")}</p>}
      </div>

      <SelectField
        label={t("cover.section.option")}
        value={plan?.option ?? UNDECIDED}
        onChange={(value) => {
          if (value === UNDECIDED) savePlan(null);
          else if (plan) change({ option: value as CoverOption });
          else savePlan(createCoverPlan(value as CoverOption));
        }}
        options={[
          { value: UNDECIDED, label: t("cover.options.undecided") },
          ...COVER_OPTIONS.map((option) => ({ value: option, label: t(`cover.options.${option}`) })),
        ]}
      />
      <p className="-mt-2 text-xs text-slate-500">
        {plan ? t(`cover.optionHelp.${plan.option}`) : t("cover.section.optionHelper")}
      </p>

      {plan && (
        <>
          <NumberField
            label={t("cover.section.needUntilAge")}
            helperText={t("cover.section.needUntilAgeHelper", { age: ACCESS_RULES.earliestAnnuityAge })}
            value={plan.needUntilAge}
            onChange={(needUntilAge) => change({ needUntilAge })}
            min={18}
            max={100}
          />
          {plan.option !== "none" && (
            <NumberField
              label={t("cover.section.monthlyCost")}
              helperText={costHelper}
              value={plan.monthlyCost}
              onChange={(monthlyCost) => change({ monthlyCost })}
              min={0}
              suffix={currency}
            />
          )}
          {plan.option === "termLife" && (
            <NumberField
              label={t("cover.section.termEndAge")}
              helperText={t("cover.section.termEndAgeHelper")}
              value={plan.termEndAge}
              onChange={(termEndAge) => change({ termEndAge })}
              min={18}
              max={100}
            />
          )}
          {plan.option === "keepPensionInsurance" && (
            <>
              <CheckboxField
                label={t("cover.section.keepPaying")}
                checked={plan.keepPayingAfterArrangement}
                onChange={(keepPayingAfterArrangement) => change({ keepPayingAfterArrangement })}
              />
              <p className="-mt-2 text-xs text-slate-500">{t("cover.section.keepPayingNote")}</p>
            </>
          )}
        </>
      )}

      {analysis && (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700" data-testid="cover-derived">
          <p className="font-medium">{t("cover.section.derivedTitle")}</p>
          <ul className="mt-1 list-disc ps-5">
            {!plan && <li>{t("cover.section.derivedNoPlan")}</li>}
            <li>
              {analysis.windows.gapYears > 0
                ? t("cover.section.derivedGap", {
                    from: formatAge(analysis.windows.gapStartAge),
                    to: formatAge(analysis.windows.needEndAge),
                    years: oneDecimal(analysis.windows.gapYears),
                    count: Number(oneDecimal(analysis.windows.gapYears)),
                  })
                : t("cover.section.derivedNoGap", { age: formatAge(analysis.windows.needEndAge) })}
            </li>
            {analysis.plan.option !== "none" &&
              (analysis.totalCost === null || analysis.monthlyCost === null ? (
                <li>{t("cover.section.derivedCostUnknown")}</li>
              ) : (
                <li>
                  {t("cover.section.derivedCost", {
                    total: money(analysis.totalCost),
                    monthly: money(analysis.monthlyCost),
                    years: oneDecimal(analysis.windows.costYears),
                    count: Number(oneDecimal(analysis.windows.costYears)),
                  })}
                </li>
              ))}
            {analysis.survivors && analysis.windows.gapYears > 0 && (
              <li>
                {t("cover.section.derivedSurvivors", {
                  insured: money(analysis.survivors.insuredMonthly),
                  balance: money(analysis.survivors.balanceOnlyMonthly),
                  gap: money(analysis.survivors.gapMonthly),
                })}
                {analysis.survivors.accountsWithoutFactor > 0 && (
                  <> {t("cover.section.derivedSurvivorsNoFactor", { accounts: analysis.survivors.accountsWithoutFactor })}</>
                )}
              </li>
            )}
          </ul>
          {analysis.survivors && analysis.windows.gapYears > 0 && (
            <p className="mt-1 text-xs text-slate-500">{t("cover.section.derivedSurvivorsNote")}</p>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
