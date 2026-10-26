import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { CheckboxField } from "../../components/fields/CheckboxField";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import type { Gender } from "../../types";

interface SpouseSectionProps {
  /** Which validation message to show, when errors are being shown. */
  error: "retirementAgeMissing" | "retirementBeforeAge" | null;
}

/** The spouse or partner of a married user. They join the plan once their age is entered. */
export function SpouseSection({ error }: SpouseSectionProps) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { spouse } = profile;
  const currency = t("common.currencySymbol");
  const prefix = "myData.steps.personal";

  const updateSpouse = (changes: Partial<typeof spouse>) =>
    updateProfile({ spouse: { ...spouse, ...changes } });
  const { bituachLeumi } = spouse;

  return (
    <section
      aria-label={t(`${prefix}.spouseSection`)}
      className="flex flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-slate-800">{t(`${prefix}.spouseSection`)}</h3>
        <p className="mt-1 text-sm text-slate-600">{t(`${prefix}.spouseIntro`)}</p>
      </div>
      <NumberField
        label={t(`${prefix}.spouseAge`)}
        helperText={t(`${prefix}.spouseAgeHelper`)}
        value={spouse.age}
        onChange={(age) => updateSpouse({ age })}
        min={18}
        max={100}
      />
      {spouse.age !== null && (
        <>
          <SelectField
            label={t(`${prefix}.spouseGender`)}
            value={spouse.gender}
            onChange={(gender) => updateSpouse({ gender: gender as Gender })}
            options={[
              { value: "male", label: t(`${prefix}.genderMale`) },
              { value: "female", label: t(`${prefix}.genderFemale`) },
            ]}
          />
          <NumberField
            label={t(`${prefix}.spouseRetirementAge`)}
            helperText={t(`${prefix}.spouseRetirementAgeHelper`)}
            value={spouse.retirementAge}
            onChange={(retirementAge) => updateSpouse({ retirementAge })}
            min={18}
            max={80}
            error={
              error === "retirementAgeMissing"
                ? t("myData.validation.required")
                : error === "retirementBeforeAge"
                  ? t("myData.validation.spouseRetirementBeforeAge")
                  : undefined
            }
          />
          <NumberField
            label={t(`${prefix}.spouseMonthlyGrossSalary`)}
            helperText={t(`${prefix}.spouseMonthlyGrossSalaryHelper`)}
            value={spouse.monthlyGrossSalary}
            onChange={(monthlyGrossSalary) => updateSpouse({ monthlyGrossSalary })}
            min={0}
            suffix={currency}
          />
          <CollapsibleSection title={t(`${prefix}.spouseBituachLeumiSection`)}>
            <p className="text-sm text-slate-600">{t(`${prefix}.spouseBituachLeumiIntro`)}</p>
            <CheckboxField
              label={t(`${prefix}.spouseBituachLeumiInclude`)}
              checked={bituachLeumi.includeInProjection}
              onChange={(includeInProjection) =>
                updateSpouse({ bituachLeumi: { ...bituachLeumi, includeInProjection } })
              }
            />
            <NumberField
              label={t(`${prefix}.spouseBituachLeumiInsuredYears`)}
              helperText={t(`${prefix}.spouseBituachLeumiInsuredYearsHelper`)}
              value={bituachLeumi.insuredYearsToDate}
              onChange={(insuredYearsToDate) =>
                updateSpouse({ bituachLeumi: { ...bituachLeumi, insuredYearsToDate } })
              }
              min={0}
              max={60}
            />
            <NumberField
              label={t(`${prefix}.spouseBituachLeumiOverride`)}
              helperText={t(`${prefix}.bituachLeumiOverrideHelper`)}
              value={bituachLeumi.monthlyPensionOverride}
              onChange={(monthlyPensionOverride) =>
                updateSpouse({ bituachLeumi: { ...bituachLeumi, monthlyPensionOverride } })
              }
              min={0}
              suffix={currency}
            />
          </CollapsibleSection>
        </>
      )}
    </section>
  );
}
