import { useTranslation } from "react-i18next";

import { SelectField } from "../../components/fields/SelectField";
import type { AccountOwner } from "../../types";

const OWNERS: AccountOwner[] = ["self", "spouse"];

interface GrantOwnerFieldProps {
  value: AccountOwner;
  onChange: (owner: AccountOwner) => void;
}

/** Says whose employer grant it is: unvested shares are lost when that person stops working. */
export function GrantOwnerField({ value, onChange }: GrantOwnerFieldProps) {
  const { t } = useTranslation();
  return (
    <>
      <SelectField
        label={t("myData.steps.equity.fields.owner")}
        value={value}
        onChange={(v) => onChange(v as AccountOwner)}
        options={OWNERS.map((owner) => ({
          value: owner,
          label: t(`myData.steps.equity.options.owner.${owner}`),
        }))}
      />
      <p className="-mt-2 text-xs text-slate-500">{t("myData.steps.equity.fields.ownerHelper")}</p>
    </>
  );
}
