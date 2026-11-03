import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { FormModal } from "../../components/FormModal";
import { DEFAULT_VESTING_TEMPLATE } from "../../domain/vesting";
import type { StockHolding, VestingSchedule } from "../../types";
import { BulkHoldingsForm } from "./BulkHoldingsForm";
import { buildBulkHoldings } from "./bulkHoldings";
import { EquityHoldingForm } from "./EquityHoldingForm";
import { CollapsibleFieldLegend } from "./FieldLegend";
import { parseHoldingCsv } from "./holdingCsv";
import { applyHoldingChange, hasRequiredHoldingFields } from "./holdingEntry";
import { useStockHistories } from "./useStockHistories";

type EntryMode = "single" | "bulk";

interface HoldingDialogProps {
  /** The holding to add or edit. */
  holding: StockHolding;
  /** True for a holding that is not saved yet; only those can be entered in bulk. */
  isNew: boolean;
  onClose: () => void;
  /** Saves the holdings, adding new ones and replacing the ones already saved. */
  onSave: (holdings: StockHolding[]) => void;
}

/** Adds or edits stock holdings, one at a time or, for a new one, many at once from pasted CSV. */
export function HoldingDialog({ holding, isNew, onClose, onSave }: HoldingDialogProps) {
  const { t } = useTranslation();
  const category = holding.investmentCategory;
  const canBulk = isNew && category !== null;

  const [mode, setMode] = useState<EntryMode>("single");
  const [draft, setDraft] = useState(holding);

  const [text, setText] = useState("");
  const [symbol, setSymbol] = useState(holding.tickerSymbol);
  const [vestingSchedule, setVestingSchedule] = useState<VestingSchedule>({
    ...DEFAULT_VESTING_TEMPLATE,
  });

  const personal = category === "personalBrokeragePurchase";
  const parsed = useMemo(
    () => (category ? parseHoldingCsv(text, category) : { rows: [], ignored: 0 }),
    [text, category],
  );
  const bulkSymbol = symbol.trim().toUpperCase();
  const symbols = useMemo(
    () =>
      personal
        ? parsed.rows.flatMap((row) => (row.symbol ? [row.symbol] : []))
        : bulkSymbol
          ? [bulkSymbol]
          : [],
    [personal, parsed, bulkSymbol],
  );
  const histories = useStockHistories(symbols);

  const bulk = mode === "bulk" && canBulk;
  const canSave = bulk
    ? parsed.rows.length > 0 && (personal || bulkSymbol !== "")
    : hasRequiredHoldingFields(draft);

  function handleSave() {
    if (bulk && category) {
      onSave(
        buildBulkHoldings({
          category,
          rows: parsed.rows,
          symbol: bulkSymbol,
          vestingSchedule,
          histories,
        }),
      );
    } else {
      onSave([draft]);
    }
  }

  const title = category
    ? t(`myData.steps.equity.options.investmentCategory.${category}`)
    : t("myData.steps.equity.holdingFormTitle");

  return (
    <FormModal
      open
      title={title}
      closeLabel={t("common.close")}
      onClose={onClose}
      note={bulk ? undefined : <CollapsibleFieldLegend />}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulk
              ? t("myData.steps.equity.bulk.add", { count: parsed.rows.length })
              : t("common.save")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {canBulk && (
          <div
            role="tablist"
            aria-label={t("myData.steps.equity.entryMode.label")}
            className="flex gap-1 border-b border-slate-200"
          >
            {(["single", "bulk"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={`-mb-px rounded-t-md border-b-2 px-5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${
                  mode === value
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {t(`myData.steps.equity.entryMode.${value}`)}
              </button>
            ))}
          </div>
        )}
        {bulk && category ? (
          <BulkHoldingsForm
            category={category}
            symbol={symbol}
            onSymbolChange={setSymbol}
            vestingSchedule={vestingSchedule}
            onVestingScheduleChange={setVestingSchedule}
            text={text}
            onTextChange={setText}
            parsed={parsed}
            histories={histories}
          />
        ) : (
          <EquityHoldingForm
            holding={draft}
            onChange={(change) => setDraft((current) => applyHoldingChange(current, change))}
          />
        )}
      </div>
    </FormModal>
  );
}
