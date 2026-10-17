import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { NumberField } from "../../components/fields/NumberField";
import { StepFooter } from "./StepFooter";

export function PensionSavingsStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { pensionSavings } = profile;
  const currency = t("common.currencySymbol");

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <NumberField
        label={t("myData.steps.pensionSavings.pensionBalance")}
        value={pensionSavings.pensionBalance}
        onChange={(pensionBalance) =>
          updateProfile({
            pensionSavings: { ...pensionSavings, pensionBalance },
          })
        }
        suffix={currency}
      />
      <NumberField
        label={t("myData.steps.pensionSavings.hishtalmutBalance")}
        value={pensionSavings.hishtalmutBalance}
        onChange={(hishtalmutBalance) =>
          updateProfile({
            pensionSavings: { ...pensionSavings, hishtalmutBalance },
          })
        }
        suffix={currency}
      />
      <NumberField
        label={t("myData.steps.pensionSavings.otherInvestments")}
        value={pensionSavings.otherInvestments}
        onChange={(otherInvestments) =>
          updateProfile({
            pensionSavings: { ...pensionSavings, otherInvestments },
          })
        }
        suffix={currency}
      />
      <StepFooter currentKey="pension-savings" />
    </div>
  );
}
