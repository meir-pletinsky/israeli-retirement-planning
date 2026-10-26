import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { CheckboxField } from "../../components/fields/CheckboxField";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import type { Gender, MaritalStatus } from "../../types";
import { StepFooter } from "./StepFooter";

const MARITAL_STATUSES: MaritalStatus[] = [
  "single",
  "married",
  "divorced",
  "widowed",
];

export function PersonalStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { personal, taxExemptionBasket } = profile;
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
  const isValid = !ageMissing && !retirementAgeMissing && !retirementBeforeAge;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <NumberField
        label={t("myData.steps.personal.age")}
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
      <NumberField
        label={t("myData.steps.personal.retirementAge")}
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
        value={personal.creditPoints}
        onChange={(creditPoints) =>
          updateProfile({ personal: { ...personal, creditPoints } })
        }
        min={0}
        max={10}
      />

      <CollapsibleSection title={t("myData.steps.personal.taxExemptionSection")}>
        <CheckboxField
          label={t("myData.steps.personal.form161DSubmitted")}
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

      <StepFooter
        currentKey="personal"
        isValid={isValid}
        onInvalidAttempt={() => setShowErrors(true)}
      />
    </div>
  );
}
