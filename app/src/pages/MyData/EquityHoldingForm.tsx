import { useTranslation } from "react-i18next";

import { CheckboxField } from "../../components/fields/CheckboxField";
import { CollapsibleSection } from "../../components/CollapsibleSection";
import { DateField } from "../../components/fields/DateField";
import { NumberField } from "../../components/fields/NumberField";
import { SelectField } from "../../components/fields/SelectField";
import { TextField } from "../../components/fields/TextField";
import type {
  InvestmentCategory,
  StockHolding,
  TaxTrack,
} from "../../types";

const INVESTMENT_CATEGORIES: InvestmentCategory[] = [
  "employerGrantedStock",
  "employerEsppDiscount",
  "personalBrokeragePurchase",
];
const TAX_TRACKS: TaxTrack[] = [
  "section102CapitalGainsTrustee",
  "section102OrdinaryIncomeTrustee",
  "section3iNonTrustee",
];

interface EquityHoldingFormProps {
  holding: StockHolding;
  onChange: (patch: Partial<StockHolding>) => void;
}

export function EquityHoldingForm({
  holding,
  onChange,
}: EquityHoldingFormProps) {
  const { t } = useTranslation();
  const f = (key: string) => t(`myData.steps.equity.fields.${key}`);
  const opt = (group: string, value: string) =>
    t(`myData.steps.equity.options.${group}.${value}`);

  const { employerGrantDetails, esppDetails, personalPurchaseDetails } =
    holding;
  const quantity = holding.quantity ?? 0;
  const price = holding.currentMarketPriceUSD ?? 0;
  const totalValue = quantity * price;

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={f("investmentCategory")}
        importance="reference"
        value={holding.investmentCategory}
        onChange={(v) =>
          onChange({ investmentCategory: v as InvestmentCategory })
        }
        options={INVESTMENT_CATEGORIES.map((v) => ({
          value: v,
          label: opt("investmentCategory", v),
        }))}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={f("tickerSymbol")}
          importance="reference"
          value={holding.tickerSymbol}
          onChange={(v) => onChange({ tickerSymbol: v.toUpperCase() })}
        />
        <TextField
          label={f("companyName")}
          importance="reference"
          value={holding.companyName}
          onChange={(companyName) => onChange({ companyName })}
        />
      </div>
      <TextField
        label={f("custodianOrBroker")}
        importance="reference"
        value={holding.custodianOrBroker}
        onChange={(custodianOrBroker) => onChange({ custodianOrBroker })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label={f("quantity")}
          importance="recommended"
          value={holding.quantity}
          onChange={(v) => onChange({ quantity: v })}
          min={0}
        />
        <NumberField
          label={f("currentMarketPriceUSD")}
          importance="recommended"
          value={holding.currentMarketPriceUSD}
          onChange={(v) => onChange({ currentMarketPriceUSD: v })}
          suffix="$"
          min={0}
        />
      </div>
      <p className="text-sm text-slate-600">
        {f("totalValue")}:{" "}
        <span className="font-semibold text-slate-900">
          ${totalValue.toLocaleString()}
        </span>
      </p>

      {holding.investmentCategory === "employerGrantedStock" && (
        <CollapsibleSection
          title={f("sectionEmployerGrantDetails")}
          importance="reference"
          defaultOpen
        >
          <p className="text-xs text-slate-500">{f("employerGrantIntro")}</p>
          <DateField
            label={f("grantDate")}
            importance="recommended"
            value={employerGrantDetails.grantDate}
            onChange={(grantDate) =>
              onChange({
                employerGrantDetails: { ...employerGrantDetails, grantDate },
              })
            }
          />
          <SelectField
            label={f("taxTrack")}
            importance="recommended"
            value={employerGrantDetails.taxTrack}
            onChange={(v) =>
              onChange({
                employerGrantDetails: {
                  ...employerGrantDetails,
                  taxTrack: v as TaxTrack,
                },
              })
            }
            options={TAX_TRACKS.map((v) => ({
              value: v,
              label: opt("taxTrack", v),
            }))}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label={f("vestedQuantity")}
              value={employerGrantDetails.vestedQuantity}
              onChange={(v) =>
                onChange({
                  employerGrantDetails: {
                    ...employerGrantDetails,
                    vestedQuantity: v,
                  },
                })
              }
              min={0}
            />
            <NumberField
              label={f("unvestedQuantity")}
              value={employerGrantDetails.unvestedQuantity}
              onChange={(v) =>
                onChange({
                  employerGrantDetails: {
                    ...employerGrantDetails,
                    unvestedQuantity: v,
                  },
                })
              }
              min={0}
            />
          </div>
          <CheckboxField
            label={f("trusteeHoldingPeriodMet")}
            checked={employerGrantDetails.trusteeHoldingPeriodMet}
            onChange={(v) =>
              onChange({
                employerGrantDetails: {
                  ...employerGrantDetails,
                  trusteeHoldingPeriodMet: v,
                },
              })
            }
          />
          <NumberField
            label={f("costBasisAtGrantUSD")}
            importance="recommended"
            helperText={f("costBasisAtGrantHelper")}
            value={employerGrantDetails.costBasisAtGrantUSD}
            onChange={(v) =>
              onChange({
                employerGrantDetails: {
                  ...employerGrantDetails,
                  costBasisAtGrantUSD: v,
                },
              })
            }
            suffix="$"
            min={0}
          />
          <NumberField
            label={f("estimatedMarginalTaxOnVesting")}
            value={employerGrantDetails.estimatedMarginalTaxOnVesting}
            onChange={(v) =>
              onChange({
                employerGrantDetails: {
                  ...employerGrantDetails,
                  estimatedMarginalTaxOnVesting: v,
                },
              })
            }
            suffix="$"
            min={0}
          />
        </CollapsibleSection>
      )}

      {holding.investmentCategory === "employerEsppDiscount" && (
        <CollapsibleSection
          title={f("sectionEsppDetails")}
          importance="reference"
          defaultOpen
        >
          <DateField
            label={f("purchaseDate")}
            value={esppDetails.purchaseDate}
            onChange={(purchaseDate) =>
              onChange({ esppDetails: { ...esppDetails, purchaseDate } })
            }
          />
          <NumberField
            label={f("discountPercentage")}
            value={esppDetails.discountPercentage}
            onChange={(v) =>
              onChange({
                esppDetails: { ...esppDetails, discountPercentage: v },
              })
            }
            suffix="%"
            min={0}
            max={50}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label={f("purchasePriceUSD")}
              value={esppDetails.purchasePriceUSD}
              onChange={(v) =>
                onChange({
                  esppDetails: { ...esppDetails, purchasePriceUSD: v },
                })
              }
              suffix="$"
              min={0}
            />
            <NumberField
              label={f("fairMarketValueAtPurchaseUSD")}
              value={esppDetails.fairMarketValueAtPurchaseUSD}
              onChange={(v) =>
                onChange({
                  esppDetails: {
                    ...esppDetails,
                    fairMarketValueAtPurchaseUSD: v,
                  },
                })
              }
              suffix="$"
              min={0}
            />
          </div>
          <NumberField
            label={f("taxedDiscountValueUSD")}
            value={esppDetails.taxedDiscountValueUSD}
            onChange={(v) =>
              onChange({
                esppDetails: { ...esppDetails, taxedDiscountValueUSD: v },
              })
            }
            suffix="$"
            min={0}
          />
          <NumberField
            label={f("capitalGainsOnGrowthUSD")}
            value={esppDetails.capitalGainsOnGrowthUSD}
            onChange={(v) =>
              onChange({
                esppDetails: { ...esppDetails, capitalGainsOnGrowthUSD: v },
              })
            }
            suffix="$"
            min={0}
          />
        </CollapsibleSection>
      )}

      {holding.investmentCategory === "personalBrokeragePurchase" && (
        <CollapsibleSection
          title={f("sectionPersonalPurchaseDetails")}
          defaultOpen
        >
          <DateField
            label={f("purchaseDate")}
            importance="reference"
            value={personalPurchaseDetails.purchaseDate}
            onChange={(purchaseDate) =>
              onChange({
                personalPurchaseDetails: {
                  ...personalPurchaseDetails,
                  purchaseDate,
                },
              })
            }
          />
          <NumberField
            label={f("averageCostBasisUSD")}
            importance="reference"
            value={personalPurchaseDetails.averageCostBasisUSD}
            onChange={(v) =>
              onChange({
                personalPurchaseDetails: {
                  ...personalPurchaseDetails,
                  averageCostBasisUSD: v,
                },
              })
            }
            suffix="$"
            min={0}
          />
          <NumberField
            label={f("unrealizedCapitalGainUSD")}
            value={personalPurchaseDetails.unrealizedCapitalGainUSD}
            onChange={(v) =>
              onChange({
                personalPurchaseDetails: {
                  ...personalPurchaseDetails,
                  unrealizedCapitalGainUSD: v,
                },
              })
            }
            suffix="$"
            min={0}
          />
          <NumberField
            label={f("capitalGainsTaxRatePercent")}
            value={personalPurchaseDetails.capitalGainsTaxRatePercent}
            onChange={(v) =>
              onChange({
                personalPurchaseDetails: {
                  ...personalPurchaseDetails,
                  capitalGainsTaxRatePercent: v,
                },
              })
            }
            suffix="%"
            min={0}
            max={100}
          />
        </CollapsibleSection>
      )}
    </div>
  );
}
