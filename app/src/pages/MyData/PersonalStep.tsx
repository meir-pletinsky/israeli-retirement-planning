import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { CheckboxField } from "../../components/fields/CheckboxField";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import type { Gender, MaritalStatus } from "../../types";
import { useActivePerson, type Person } from "./activePerson";
import { PersonTabs, type PersonTab } from "./PersonTabs";
import { StepFooter } from "./StepFooter";
import { SpouseSection } from "./SpouseSection";

const MARITAL_STATUSES: MaritalStatus[] = [
  "single",
  "married",
  "divorced",
  "widowed",
];

export function PersonalStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { personal, taxExemptionBasket, bituachLeumi } = profile;
  const currency = t("common.currencySymbol");
  const [showErrors, setShowErrors] = useState(false);

  // These two fields drive every domain calculation (see app/src/domain);
  // require them explicitly so the dashboard never silently substitutes
  // defaults without the user realizing it.
  const ageMissing = personal.age === null;
  const retirementAgeMissing = personal.retirementAge === null;
  const retirementBeforeAge =
    !ageMissing &&
    !retirementAgeMissing &&
    personal.retirementAge! <= personal.age!;

  // The spouse joins the plan once their age is entered, from which point
  // their retirement age matters too. Unlike the primary user they may have
  // retired already (retirement age equal to their age).
  const { spouse } = profile;
  const isMarried = personal.maritalStatus === "married";
  const spouseError: "retirementAgeMissing" | "retirementBeforeAge" | null =
    !isMarried || spouse.age === null
      ? null
      : spouse.retirementAge === null
        ? "retirementAgeMissing"
        : spouse.retirementAge < spouse.age
          ? "retirementBeforeAge"
          : null;
  const isValid =
    !ageMissing && !retirementAgeMissing && !retirementBeforeAge && spouseError === null;

  const { person: selectedPerson, setPerson } = useActivePerson();
  const person: Person = isMarried ? selectedPerson : "self";
  const selfHasError = ageMissing || retirementAgeMissing || retirementBeforeAge;

  const tabs: PersonTab[] = [
    {
      person: "self",
      detail:
        personal.age === null ? undefined : t("myData.person.ageDetail", { age: personal.age }),
      hasError: showErrors && selfHasError,
    },
    {
      person: "spouse",
      detail:
        spouse.age === null
          ? t("myData.person.addAgeToInclude")
          : t("myData.person.ageDetail", { age: spouse.age }),
      hasError: showErrors && spouseError !== null,
    },
  ];

  function handleInvalidAttempt() {
    setShowErrors(true);
    // Show the person whose fields need fixing.
    if (isMarried) setPerson(selfHasError ? "self" : "spouse");
  }

  const selfFields = (
    <>
      <NumberField
        label={t("myData.steps.personal.age")}
        importance="required"
        value={personal.age}
        onChange={(age) => updateProfile({ personal: { ...personal, age } })}
        min={18}
        max={100}
        error={
          showErrors && ageMissing
            ? t("myData.validation.required")
            : undefined
        }
      />
      <SelectField
        label={t("myData.steps.personal.gender")}
        importance="recommended"
        value={personal.gender}
        onChange={(gender) =>
          updateProfile({ personal: { ...personal, gender: gender as Gender } })
        }
        options={[
          { value: "male", label: t("myData.steps.personal.genderMale") },
          { value: "female", label: t("myData.steps.personal.genderFemale") },
        ]}
      />
      <SelectField
        label={t("myData.steps.personal.maritalStatus")}
        importance="recommended"
        value={personal.maritalStatus}
        onChange={(maritalStatus) =>
          updateProfile({
            personal: { ...personal, maritalStatus: maritalStatus as MaritalStatus },
          })
        }
        options={MARITAL_STATUSES.map((status) => ({
          value: status,
          label: t(
            `myData.steps.personal.maritalStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`,
          ),
        }))}
      />
      <p role="note" className="-mt-2 text-xs text-slate-600">
        {t(
          isMarried
            ? "myData.steps.personal.householdNoteMarried"
            : "myData.steps.personal.householdNoteUnmarried",
        )}
      </p>
      <NumberField
        label={t("myData.steps.personal.retirementAge")}
        importance="required"
        value={personal.retirementAge}
        onChange={(retirementAge) =>
          updateProfile({ personal: { ...personal, retirementAge } })
        }
        min={50}
        max={80}
        error={
          showErrors && retirementAgeMissing
            ? t("myData.validation.required")
            : showErrors && retirementBeforeAge
              ? t("myData.validation.retirementAfterAge")
              : undefined
        }
      />
      <NumberField
        label={t("myData.steps.personal.monthlyGrossSalary")}
        importance="recommended"
        helperText={t("myData.steps.personal.monthlyGrossSalaryHelper")}
        value={personal.monthlyGrossSalary}
        onChange={(monthlyGrossSalary) =>
          updateProfile({ personal: { ...personal, monthlyGrossSalary } })
        }
        min={0}
        suffix={currency}
      />
      <NumberField
        label={t("myData.steps.personal.creditPoints")}
        helperText={t("myData.steps.personal.creditPointsHelper")}
        value={personal.creditPoints}
        onChange={(creditPoints) =>
          updateProfile({ personal: { ...personal, creditPoints } })
        }
        min={0}
        max={10}
        step={0.25}
      />

      <CollapsibleSection title={t("myData.steps.personal.taxExemptionSection")}>
        <CheckboxField
          label={t("myData.steps.personal.form161DSubmitted")}
          importance="reference"
          checked={taxExemptionBasket.form161DSubmitted}
          onChange={(form161DSubmitted) =>
            updateProfile({
              taxExemptionBasket: { ...taxExemptionBasket, form161DSubmitted },
            })
          }
        />
        <NumberField
          label={t("myData.steps.personal.pastTaxFreeSeveranceWithdrawn")}
          value={taxExemptionBasket.pastTaxFreeSeveranceWithdrawn}
          onChange={(v) =>
            updateProfile({
              taxExemptionBasket: {
                ...taxExemptionBasket,
                pastTaxFreeSeveranceWithdrawn: v,
              },
            })
          }
          suffix={currency}
        />
        <NumberField
          label={t("myData.steps.personal.remainingMonthlyExemptionCap")}
          value={taxExemptionBasket.remainingMonthlyExemptionCap}
          onChange={(v) =>
            updateProfile({
              taxExemptionBasket: {
                ...taxExemptionBasket,
                remainingMonthlyExemptionCap: v,
              },
            })
          }
          suffix={currency}
        />
      </CollapsibleSection>

      <CollapsibleSection title={t("myData.steps.personal.bituachLeumiSection")}>
        <p className="text-sm text-slate-600">
          {t("myData.steps.personal.bituachLeumiIntro")}
        </p>
        <CheckboxField
          label={t("myData.steps.personal.bituachLeumiInclude")}
          checked={bituachLeumi.includeInProjection}
          onChange={(includeInProjection) =>
            updateProfile({
              bituachLeumi: { ...bituachLeumi, includeInProjection },
            })
          }
        />
        <NumberField
          label={t("myData.steps.personal.bituachLeumiInsuredYears")}
          helperText={t("myData.steps.personal.bituachLeumiInsuredYearsHelper")}
          value={bituachLeumi.insuredYearsToDate}
          onChange={(insuredYearsToDate) =>
            updateProfile({
              bituachLeumi: { ...bituachLeumi, insuredYearsToDate },
            })
          }
          min={0}
          max={60}
        />
        <NumberField
          label={t("myData.steps.personal.bituachLeumiOverride")}
          helperText={t("myData.steps.personal.bituachLeumiOverrideHelper")}
          value={bituachLeumi.monthlyPensionOverride}
          onChange={(monthlyPensionOverride) =>
            updateProfile({
              bituachLeumi: { ...bituachLeumi, monthlyPensionOverride },
            })
          }
          min={0}
          suffix={currency}
        />
      </CollapsibleSection>
    </>
  );

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {isMarried ? (
        <PersonTabs id="personal" tabs={tabs} active={person} onChange={setPerson}>
          {person === "self" ? selfFields : <SpouseSection error={showErrors ? spouseError : null} />}
        </PersonTabs>
      ) : (
        selfFields
      )}

      <StepFooter
        currentKey="personal"
        isValid={isValid}
        onInvalidAttempt={handleInvalidAttempt}
      />
    </div>
  );
}
