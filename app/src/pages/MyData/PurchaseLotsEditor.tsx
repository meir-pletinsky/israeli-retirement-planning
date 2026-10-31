import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { DateField } from "../../components/fields/DateField";
import { NumberField } from "../../components/fields/NumberField";
import { holdingLots, incompleteLotCount, usdToIlsRate } from "../../domain";
import { createEmptyPurchaseLot, type PurchaseLot, type StockHolding } from "../../types";
import { entryDate, entryPriceUsd, entryRate, type HoldingChange } from "./holdingEntry";
import { formatCurrency } from "./summaryFormat";
import { useDatedRateAutofill } from "./useDatedRateAutofill";

interface PurchaseLotsEditorProps {
  /** An ESPP or private holding. The lots are part of its quantity. */
  holding: StockHolding;
  onChange: (change: HoldingChange) => void;
}

/** Keeps an amount left to right inside right-to-left text. */
const ltr = (text: string) => `\u2066${text}\u2069`;

function patchLots(change: (lots: PurchaseLot[]) => PurchaseLot[]): HoldingChange {
  return (current) => ({ purchaseLots: change(current.purchaseLots) });
}

interface PurchaseLotCardProps {
  lot: PurchaseLot;
  number: number;
  isEspp: boolean;
  onChange: (change: HoldingChange) => void;
}

function PurchaseLotCard({ lot, number, isEspp, onChange }: PurchaseLotCardProps) {
  const { t } = useTranslation();
  const f = (key: string, params?: Record<string, unknown>) =>
    t(`myData.steps.equity.lots.${key}`, params);

  const patchLot = useCallback(
    (patch: Partial<PurchaseLot>) =>
      onChange(
        patchLots((lots) => lots.map((other) => (other.id === lot.id ? { ...other, ...patch } : other))),
      ),
    [onChange, lot.id],
  );
  const setRate = useCallback((rate: number | null) => patchLot({ usdToIlsRate: rate }), [patchLot]);
  const rateHint = useDatedRateAutofill(lot.purchaseDate, lot.usdToIlsRate, setRate);

  return (
    <div
      className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
      role="group"
      aria-label={f("lot", { n: number })}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">{f("lot", { n: number })}</span>
        <button
          type="button"
          onClick={() => onChange(patchLots((lots) => lots.filter((other) => other.id !== lot.id)))}
          className="text-xs font-medium text-rose-600 hover:text-rose-700"
        >
          {f("remove")}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateField
          label={f("date")}
          importance="recommended"
          value={lot.purchaseDate}
          onChange={(purchaseDate) => patchLot({ purchaseDate })}
        />
        <NumberField
          label={f("quantity")}
          importance="recommended"
          value={lot.quantity}
          onChange={(quantity) => patchLot({ quantity })}
          min={0}
        />
        <NumberField
          label={isEspp ? f("priceEspp") : f("pricePersonal")}
          importance="recommended"
          helperText={isEspp ? f("priceEsppHelper") : undefined}
          value={lot.priceUSD}
          onChange={(priceUSD) => patchLot({ priceUSD })}
          suffix="$"
          min={0}
        />
        <NumberField
          label={f("rate")}
          importance="reference"
          helperText={f("rateHelper")}
          value={lot.usdToIlsRate}
          onChange={(rate) => patchLot({ usdToIlsRate: rate })}
          suffix="₪"
          min={0}
          step={0.0001}
        />
      </div>
      {rateHint && (
        <p className="text-xs text-slate-500">{f("rateFilled", { date: ltr(rateHint.rateDate) })}</p>
      )}
    </div>
  );
}

export function PurchaseLotsEditor({ holding, onChange }: PurchaseLotsEditorProps) {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const f = (key: string, params?: Record<string, unknown>) =>
    t(`myData.steps.equity.lots.${key}`, params);
  const currency = t("common.currencySymbol");

  const lots = holding.purchaseLots;
  const isEspp = holding.investmentCategory === "employerEsppDiscount";
  const outcome = holdingLots(holding, usdToIlsRate(profile));
  const incomplete = incompleteLotCount(holding);
  const startPrice = entryPriceUsd(holding);

  function startFromEntry() {
    onChange(
      patchLots((current) => [
        ...current,
        {
          ...createEmptyPurchaseLot(),
          purchaseDate: entryDate(holding),
          quantity: holding.quantity,
          priceUSD: entryPriceUsd(holding),
          usdToIlsRate: entryRate(holding),
        },
      ]),
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">{f("title")}</h4>
        <p className="mt-1 text-xs text-slate-500">{isEspp ? f("introEspp") : f("introPersonal")}</p>
      </div>

      {lots.map((lot, index) => (
        <PurchaseLotCard
          key={lot.id}
          lot={lot}
          number={index + 1}
          isEspp={isEspp}
          onChange={onChange}
        />
      ))}

      {outcome?.exceedsQuantity && (
        <p className="text-xs text-amber-700" role="status">
          {f("exceeds", { listed: outcome.listedQuantity, quantity: holding.quantity ?? 0 })}
        </p>
      )}

      {incomplete > 0 && <p className="text-xs text-amber-700">{f("incomplete", { count: incomplete })}</p>}

      {outcome && (
        <p className="text-xs text-slate-600">
          {f("summary", {
            shares: Math.round(outcome.coveredQuantity * 100) / 100,
            basis: ltr(formatCurrency(Math.round(outcome.costBasisIls), currency)),
            gain: ltr(formatCurrency(Math.round(outcome.gainIls), currency)),
          })}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(patchLots((current) => [...current, createEmptyPurchaseLot()]))}
          className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          {f("add")}
        </button>
        {lots.length === 0 && startPrice !== null && (
          <button
            type="button"
            onClick={startFromEntry}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            {f("startFromEntry")}
          </button>
        )}
      </div>
    </div>
  );
}
