import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import type { Gender } from "../../types";
import { StepFooter } from "./StepFooter";

export function PersonalStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { personal } = profile;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <NumberField
        label={t("myData.steps.personal.age")}
        value={personal.age}
        onChange={(age) => updateProfile({ personal: { ...personal, age } })}
        min={18}
        max={100}
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
      <NumberField
        label={t("myData.steps.personal.retirementAge")}
        value={personal.retirementAge}
        onChange={(retirementAge) =>
          updateProfile({ personal: { ...personal, retirementAge } })
        }
        min={50}
        max={80}
      />
      <StepFooter currentKey="personal" />
    </div>
  );
}
