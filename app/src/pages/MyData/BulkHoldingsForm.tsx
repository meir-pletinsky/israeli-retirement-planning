import { useTranslation } from "react-i18next";

import { TextField } from "../../components/fields/TextField";
import { formatDate } from "../../domain/dates";
import type { StockHistoryFile } from "../../stockPrices/format";
import type { InvestmentCategory, VestingSchedule } from "../../types";
import { rowPrice } from "./bulkHoldings";
import type { HoldingCsvResult } from "./holdingCsv";
import { useStockSuggestions } from "./useStockHistories";
import { VestingScheduleFields } from "./VestingScheduleFields";

interface BulkHoldingsFormProps {
  category: InvestmentCategory;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  vestingSchedule: VestingSchedule;
  onVestingScheduleChange: (schedule: VestingSchedule) => void;
  text: string;
  onTextChange: (text: string) => void;
  parsed: HoldingCsvResult;
  histories: ReadonlyMap<string, StockHistoryFile>;
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Adds many purchases of one category from pasted CSV text, showing what was understood. */
export function BulkHoldingsForm({
  category,
  symbol,
  onSymbolChange,
  vestingSchedule,
  onVestingScheduleChange,
  text,
  onTextChange,
  parsed,
  histories,
}: BulkHoldingsFormProps) {
  const { t } = useTranslation();
  const b = (key: string, params?: Record<string, unknown>) =>
    t(`myData.steps.equity.bulk.${key}`, params);
  const f = (key: string) => t(`myData.steps.equity.fields.${key}`);
  const suggestions = useStockSuggestions();

  const personal = category === "personalBrokeragePurchase";

  return (
    <div className="flex flex-col gap-4">
      {!personal && (
        <TextField
          label={f("tickerSymbol")}
          importance="required"
          value={symbol}
          onChange={(value) => onSymbolChange(value.toUpperCase())}
          suggestions={suggestions.length > 0 ? suggestions : undefined}
          suggestionsId="bulk-stock-ticker-suggestions"
          helperText={b("symbolHelper")}
        />
      )}
      {category === "employerGrantedStock" && (
        <VestingScheduleFields
          schedule={vestingSchedule}
          onChange={onVestingScheduleChange}
          intro={t("myData.steps.equity.vesting.introBulk")}
        />
      )}
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{b("csvLabel")}</span>
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={b(personal ? "csvPlaceholderPersonal" : "csvPlaceholderEmployer")}
          rows={6}
          dir="ltr"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
        />
        <span className="mt-1 block text-xs text-slate-400">
          {b(personal ? "csvHelperPersonal" : "csvHelperEmployer")}
        </span>
      </label>

      <div>
        <h3 className="text-sm font-semibold text-slate-700">{b("previewTitle")}</h3>
        {parsed.rows.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{b("noRows")}</p>
        ) : (
          <div className="mt-2 max-h-64 overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-sm" dir="ltr">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">{b("colDate")}</th>
                  {personal && <th className="px-3 py-2 font-medium">{b("colSymbol")}</th>}
                  <th className="px-3 py-2 text-right font-medium">{b("colQuantity")}</th>
                  <th className="px-3 py-2 text-right font-medium">{b("colPrice")}</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row) => {
                  const { price, estimated } = rowPrice(
                    row,
                    personal ? (row.symbol ?? "") : symbol.trim(),
                    histories,
                  );
                  return (
                    <tr key={row.line} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">{formatDate(row.date)}</td>
                      {personal && <td className="px-3 py-1.5">{row.symbol}</td>}
                      <td className="px-3 py-1.5 text-right">
                        {row.quantity.toLocaleString("en-US", { maximumFractionDigits: 6 })}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {price === null
                          ? "—"
                          : estimated
                            ? b("priceEstimated", { price: MONEY.format(price) })
                            : MONEY.format(price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {parsed.ignored > 0 && (
          <p className="mt-2 text-xs text-slate-500">{b("ignored", { count: parsed.ignored })}</p>
        )}
        <p className="mt-1 text-xs text-slate-400">{b("priceNote")}</p>
        {!personal && symbol.trim() === "" && (
          <p className="mt-1 text-xs text-amber-700">{b("needsSymbol")}</p>
        )}
      </div>
    </div>
  );
}
