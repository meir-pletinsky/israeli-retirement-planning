import { useTranslation } from "react-i18next";

import { CheckboxField } from "../../components/fields/CheckboxField";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { DateField } from "../../components/fields/DateField";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import { TextField } from "../../components/fields/TextField";
import type {
  AccountStatus,
  AnnuityTaxType,
  GuaranteedPaymentMonths,
  LegacyPolicyModel,
  PensionAccount,
  ProductCategory,
} from "../../types";

const PRODUCT_CATEGORIES: ProductCategory[] = [
  "comprehensivePension",
  "generalPension",
  "managersInsurance",
  "providentFund",
  "investmentProvidentFund",
  "studyFund",
  "iraProvidentFund",
];
const LEGACY_POLICY_MODELS: LegacyPolicyModel[] = [
  "none",
  "adif",
  "meitav",
  "profitSharing1992",
  "budgetary",
];
const ACCOUNT_STATUSES: AccountStatus[] = [
  "activeContributing",
  "paidUpFrozen",
  "payingAnnuity",
];
const ANNUITY_TAX_TYPES: AnnuityTaxType[] = [
  "recognizedAnnuity",
  "qualifyingAnnuity",
];
const GUARANTEED_MONTHS: GuaranteedPaymentMonths[] = [0, 60, 120, 180, 240];

interface PensionAccountFormProps {
  account: PensionAccount;
  onChange: (patch: Partial<PensionAccount>) => void;
}

export function PensionAccountForm({
  account,
  onChange,
}: PensionAccountFormProps) {
  const { t } = useTranslation();
  const currency = t("common.currencySymbol");
  const f = (key: string) => t(`myData.steps.pensionSavings.fields.${key}`);
  const opt = (group: string, value: string | number) =>
    t(`myData.steps.pensionSavings.options.${group}.${value}`);

  const { balanceBreakdown, annuityParameters, insuranceCoverages, investmentAndFees, contributions } =
    account;
  const providerSuggestions = t("myData.steps.pensionSavings.providerSuggestions", {
    returnObjects: true,
  }) as string[];

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={f("providerName")}
        value={account.providerName}
        onChange={(providerName) => onChange({ providerName })}
        suggestions={providerSuggestions}
        suggestionsId="pension-provider-suggestions"
      />
      <SelectField
        label={f("productCategory")}
        value={account.productCategory}
        onChange={(v) => onChange({ productCategory: v as ProductCategory })}
        options={PRODUCT_CATEGORIES.map((v) => ({
          value: v,
          label: opt("productCategory", v),
        }))}
      />
      <SelectField
        label={f("accountStatus")}
        value={account.accountStatus}
        onChange={(v) => onChange({ accountStatus: v as AccountStatus })}
        options={ACCOUNT_STATUSES.map((v) => ({
          value: v,
          label: opt("accountStatus", v),
        }))}
      />
      <SelectField
        label={f("legacyPolicyModel")}
        value={account.legacyPolicyModel}
        onChange={(v) =>
          onChange({ legacyPolicyModel: v as LegacyPolicyModel })
        }
        options={LEGACY_POLICY_MODELS.map((v) => ({
          value: v,
          label: opt("legacyPolicyModel", v),
        }))}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField
          label={f("joinDate")}
          value={account.joinDate}
          onChange={(joinDate) => onChange({ joinDate })}
        />
        <DateField
          label={f("liquidityDate")}
          value={account.liquidityDate}
          onChange={(liquidityDate) => onChange({ liquidityDate })}
        />
      </div>
      <NumberField
        label={f("totalAccumulatedBalance")}
        value={account.totalAccumulatedBalance}
        onChange={(totalAccumulatedBalance) =>
          onChange({ totalAccumulatedBalance })
        }
        suffix={currency}
      />

      <CollapsibleSection title={f("sectionBalanceBreakdown")}>
        <NumberField
          label={f("pre2008CapitalBalance")}
          value={balanceBreakdown.pre2008CapitalBalance}
          onChange={(v) =>
            onChange({
              balanceBreakdown: { ...balanceBreakdown, pre2008CapitalBalance: v },
            })
          }
          suffix={currency}
        />
        <NumberField
          label={f("post2008AnnuityBalance")}
          value={balanceBreakdown.post2008AnnuityBalance}
          onChange={(v) =>
            onChange({
              balanceBreakdown: { ...balanceBreakdown, post2008AnnuityBalance: v },
            })
          }
          suffix={currency}
        />
        <NumberField
          label={f("tikun190CapitalBalance")}
          value={balanceBreakdown.tikun190CapitalBalance}
          onChange={(v) =>
            onChange({
              balanceBreakdown: { ...balanceBreakdown, tikun190CapitalBalance: v },
            })
          }
          suffix={currency}
        />
        <NumberField
          label={f("severanceBalance")}
          value={balanceBreakdown.severanceBalance}
          onChange={(v) =>
            onChange({
              balanceBreakdown: { ...balanceBreakdown, severanceBalance: v },
            })
          }
          suffix={currency}
        />
      </CollapsibleSection>

      <CollapsibleSection title={f("sectionContributions")}>
        <p className="text-xs text-slate-500">{f("contributionsHelper")}</p>
        <NumberField
          label={f("employeeRatePercent")}
          value={contributions.employeeRatePercent}
          onChange={(v) =>
            onChange({ contributions: { ...contributions, employeeRatePercent: v } })
          }
          suffix="%"
          min={0}
          max={100}
        />
        <NumberField
          label={f("employerRatePercent")}
          value={contributions.employerRatePercent}
          onChange={(v) =>
            onChange({ contributions: { ...contributions, employerRatePercent: v } })
          }
          suffix="%"
          min={0}
          max={100}
        />
        <NumberField
          label={f("severanceRatePercent")}
          value={contributions.severanceRatePercent}
          onChange={(v) =>
            onChange({ contributions: { ...contributions, severanceRatePercent: v } })
          }
          suffix="%"
          min={0}
          max={100}
        />
      </CollapsibleSection>

      <CollapsibleSection title={f("sectionAnnuityParameters")}>
        <p className="text-xs text-slate-500">{f("annuityParametersHelper")}</p>
        <CheckboxField
          label={f("hasGuaranteedFactor")}
          checked={annuityParameters.hasGuaranteedFactor}
          onChange={(v) =>
            onChange({
              annuityParameters: { ...annuityParameters, hasGuaranteedFactor: v },
            })
          }
        />
        <NumberField
          label={f("conversionFactor")}
          value={annuityParameters.conversionFactor}
          onChange={(v) =>
            onChange({
              annuityParameters: { ...annuityParameters, conversionFactor: v },
            })
          }
          min={100}
          max={300}
        />
        <NumberField
          label={f("estimatedMonthlyAnnuity")}
          value={annuityParameters.estimatedMonthlyAnnuity}
          onChange={(v) =>
            onChange({
              annuityParameters: {
                ...annuityParameters,
                estimatedMonthlyAnnuity: v,
              },
            })
          }
          suffix={currency}
        />
        <SelectField
          label={f("annuityTaxType")}
          value={annuityParameters.annuityTaxType}
          onChange={(v) =>
            onChange({
              annuityParameters: {
                ...annuityParameters,
                annuityTaxType: v as AnnuityTaxType,
              },
            })
          }
          options={ANNUITY_TAX_TYPES.map((v) => ({
            value: v,
            label: opt("annuityTaxType", v),
          }))}
        />
        <SelectField
          label={f("guaranteedPaymentMonths")}
          value={annuityParameters.guaranteedPaymentMonths?.toString() ?? null}
          onChange={(v) =>
            onChange({
              annuityParameters: {
                ...annuityParameters,
                guaranteedPaymentMonths: Number(v) as GuaranteedPaymentMonths,
              },
            })
          }
          options={GUARANTEED_MONTHS.map((v) => ({
            value: v.toString(),
            label: opt("guaranteedPaymentMonths", v),
          }))}
        />
      </CollapsibleSection>

      <CollapsibleSection title={f("sectionInsuranceCoverages")}>
        <NumberField
          label={f("deathCoverageAmount")}
          value={insuranceCoverages.deathCoverageAmount}
          onChange={(v) =>
            onChange({
              insuranceCoverages: { ...insuranceCoverages, deathCoverageAmount: v },
            })
          }
          suffix={currency}
        />
        <NumberField
          label={f("monthlyDisabilityAmount")}
          value={insuranceCoverages.monthlyDisabilityAmount}
          onChange={(v) =>
            onChange({
              insuranceCoverages: {
                ...insuranceCoverages,
                monthlyDisabilityAmount: v,
              },
            })
          }
          suffix={currency}
        />
        <NumberField
          label={f("monthlyRiskDeduction")}
          value={insuranceCoverages.monthlyRiskDeduction}
          onChange={(v) =>
            onChange({
              insuranceCoverages: {
                ...insuranceCoverages,
                monthlyRiskDeduction: v,
              },
            })
          }
          suffix={currency}
        />
      </CollapsibleSection>

      <CollapsibleSection title={f("sectionInvestmentAndFees")}>
        <TextField
          label={f("investmentTrackName")}
          value={investmentAndFees.investmentTrackName}
          onChange={(v) =>
            onChange({
              investmentAndFees: { ...investmentAndFees, investmentTrackName: v },
            })
          }
        />
        <NumberField
          label={f("feeFromAccumulationPercent")}
          value={investmentAndFees.feeFromAccumulationPercent}
          onChange={(v) =>
            onChange({
              investmentAndFees: {
                ...investmentAndFees,
                feeFromAccumulationPercent: v,
              },
            })
          }
          suffix="%"
          min={0}
          max={2}
        />
        <NumberField
          label={f("feeFromDepositPercent")}
          value={investmentAndFees.feeFromDepositPercent}
          onChange={(v) =>
            onChange({
              investmentAndFees: {
                ...investmentAndFees,
                feeFromDepositPercent: v,
              },
            })
          }
          suffix="%"
          min={0}
          max={10}
        />
        <NumberField
          label={f("profitSharingFeePercent")}
          value={investmentAndFees.profitSharingFeePercent}
          onChange={(v) =>
            onChange({
              investmentAndFees: {
                ...investmentAndFees,
                profitSharingFeePercent: v,
              },
            })
          }
          suffix="%"
          min={0}
          max={20}
        />
        <CheckboxField
          label={f("hasStateYieldGuarantee")}
          checked={investmentAndFees.hasStateYieldGuarantee}
          onChange={(v) =>
            onChange({
              investmentAndFees: {
                ...investmentAndFees,
                hasStateYieldGuarantee: v,
              },
            })
          }
        />
      </CollapsibleSection>
    </div>
  );
}
