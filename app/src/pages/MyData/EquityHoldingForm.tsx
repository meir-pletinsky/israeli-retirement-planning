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
import {
  CATEGORY_ORDER,
  categoryChangePatch,
  entryDate,
  entryDatePatch,
  entryPricePatch,
  entryPriceUsd,
  entryRate,
  entryRatePatch,
  hasAdvancedDetails,
  type HoldingChange,
} from "./holdingEntry";
import { VestingTranchesEditor } from "./VestingTranchesEditor";
import { useEntryRateAutofill } from "./useEntryRateAutofill";
import { useStockPriceAutofill } from "./useStockPriceAutofill";

const TAX_TRACKS: TaxTrack[] = [
  "section102CapitalGainsTrustee",
  "section102OrdinaryIncomeTrustee",
  "section3iNonTrustee",
];

interface EquityHoldingFormProps {
  holding: StockHolding;
  onChange: (change: HoldingChange) => void;
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
  const category = holding.investmentCategory;
  const detailsOpen = hasAdvancedDetails(holding);
  const { suggestions, hint } = useStockPriceAutofill(holding, onChange);
  const rateHint = useEntryRateAutofill(holding, onChange);

  const entryFields = {
    employerGrantedStock: {
      dateLabel: f("grantDate"),
      priceLabel: f("costBasisAtGrantUSD"),
      priceHelper: f("costBasisAtGrantHelper"),
      importance: "recommended" as const,
    },
    employerEsppDiscount: {
      dateLabel: f("purchaseDate"),
      priceLabel: f("esppPriceOnPurchaseDate"),
      priceHelper: f("esppPriceOnPurchaseDateHelper"),
      importance: "reference" as const,
    },
    personalBrokeragePurchase: {
      dateLabel: f("purchaseDate"),
      priceLabel: f("personalPurchasePrice"),
      priceHelper: f("personalPurchasePriceHelper"),
      importance: "reference" as const,
    },
  };
  const entry = category
    ? entryFields[category]
    : {
        dateLabel: f("entryDateGeneric"),
        priceLabel: f("entryPriceGeneric"),
        priceHelper: f("entryPriceGenericHelper"),
        importance: "recommended" as const,
      };

  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label={f("investmentCategory")}
        importance="reference"
        value={category}
        onChange={(v) => onChange(categoryChangePatch(holding, v as InvestmentCategory))}
        options={CATEGORY_ORDER.map((v) => ({
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
          suggestions={suggestions.length > 0 ? suggestions : undefined}
          suggestionsId="stock-ticker-suggestions"
          helperText={suggestions.length > 0 ? f("tickerHelper") : undefined}
        />
        <NumberField
          label={f("quantity")}
          importance="recommended"
          value={holding.quantity}
          onChange={(v) => onChange({ quantity: v })}
          min={0}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField
          label={entry.dateLabel}
          importance={entry.importance}
          value={entryDate(holding)}
          onChange={(date) => onChange(entryDatePatch(holding, date))}
        />
        <NumberField
          label={entry.priceLabel}
          importance={entry.importance}
          helperText={entry.priceHelper}
          value={entryPriceUsd(holding)}
          onChange={(v) => onChange(entryPricePatch(holding, v))}
          suffix="$"
          min={0}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label={f("entryRate")}
          importance="reference"
          helperText={f("entryRateHelper")}
          value={entryRate(holding)}
          onChange={(v) => onChange(entryRatePatch(holding, v))}
          suffix="₪"
          min={0}
          step={0.0001}
        />
      </div>
      {(hint || rateHint) && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {hint?.entryPriceDate && (
            <p>
              {t("myData.steps.equity.fields.priceHintEntry", { date: hint.entryPriceDate })}
            </p>
          )}
          {hint?.currentPriceDate && (
            <p>
              {t("myData.steps.equity.fields.priceHintCurrent", { date: hint.currentPriceDate })}
            </p>
          )}
          {hint && <p className="mt-1">{f("priceHintAdjusted")}</p>}
          {rateHint && (
            <p className={hint ? "mt-1" : undefined}>
              {t("myData.steps.equity.fields.rateHint", { date: rateHint.rateDate })}
            </p>
          )}
        </div>
      )}
      <NumberField
        label={f("currentMarketPriceUSD")}
        importance="recommended"
        helperText={f("currentMarketPriceHelper")}
        value={holding.currentMarketPriceUSD}
        onChange={(v) => onChange({ currentMarketPriceUSD: v })}
        suffix="$"
        min={0}
      />
      <p className="text-sm text-slate-600">
        {f("totalValue")}:{" "}
        <span className="font-semibold text-slate-900">
          ${totalValue.toLocaleString()}
        </span>
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={f("companyName")}
          importance="reference"
          value={holding.companyName}
          onChange={(companyName) => onChange({ companyName })}
        />
        <TextField
          label={f("custodianOrBroker")}
          importance="reference"
          value={holding.custodianOrBroker}
          onChange={(custodianOrBroker) => onChange({ custodianOrBroker })}
        />
      </div>

      {category === "employerGrantedStock" && (
        <CollapsibleSection
          title={f("sectionEmployerGrantDetails")}
          importance="reference"
          defaultOpen={detailsOpen}
        >
          <p className="text-xs text-slate-500">{f("employerGrantIntro")}</p>
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
          <VestingTranchesEditor
            tranches={employerGrantDetails.vestingTranches}
            holdingQuantity={quantity}
            onChange={(vestingTranches) =>
              onChange({
                employerGrantDetails: { ...employerGrantDetails, vestingTranches },
              })
            }
          />
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

      {category === "employerEsppDiscount" && (
        <CollapsibleSection
          title={f("sectionEsppDetails")}
          importance="reference"
          defaultOpen={detailsOpen}
        >
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

      {category === "personalBrokeragePurchase" && (
        <CollapsibleSection
          title={f("sectionPersonalPurchaseDetails")}
          defaultOpen={detailsOpen}
        >
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
