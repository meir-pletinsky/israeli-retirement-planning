import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { NumberField } from "../../components/fields/NumberField";
import { StepFooter } from "./StepFooter";

export function ExpensesStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { expenses } = profile;
  const currency = t("common.currencySymbol");

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <NumberField
        label={t("myData.steps.expenses.currentMonthly")}
        importance="reference"
        value={expenses.currentMonthly}
        onChange={(currentMonthly) =>
          updateProfile({ expenses: { ...expenses, currentMonthly } })
        }
        suffix={currency}
      />
      <NumberField
        label={t("myData.steps.expenses.retirementMonthly")}
        importance="recommended"
        helperText={t("myData.steps.expenses.retirementMonthlyHelper")}
        value={expenses.retirementMonthly}
        onChange={(retirementMonthly) =>
          updateProfile({ expenses: { ...expenses, retirementMonthly } })
        }
        suffix={currency}
      />
      <StepFooter currentKey="expenses" />
    </div>
  );
}
