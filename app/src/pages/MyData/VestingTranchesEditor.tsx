import { useState } from "react";
import { useTranslation } from "react-i18next";

import { DateField } from "../../components/fields/DateField";
import { NumberField } from "../../components/fields/NumberField";
import {
  DEFAULT_VESTING_TEMPLATE,
  MAX_TEMPLATE_BATCHES,
  engineNowMs,
  generateVestingSchedule,
  vestedQuantityAt,
  type VestingTemplate,
} from "../../domain";
import { createEmptyVestingTranche, type StockHolding, type VestingTranche } from "../../types";

interface VestingTranchesEditorProps {
  /** The employer grant whose batches are edited. The batches are part of its quantity. */
  holding: StockHolding;
  onChange: (tranches: VestingTranche[]) => void;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** ISO date to the day-first format used in Israel, kept left to right inside right-to-left text. */
const formatDate = (iso: string) => `\u2066${iso.split("-").reverse().join(".")}\u2069`;

export function VestingTranchesEditor({ holding, onChange }: VestingTranchesEditorProps) {
  const { t } = useTranslation();
  const f = (key: string, params?: Record<string, unknown>) =>
    t(`myData.steps.equity.tranches.${key}`, params);

  const tranches = holding.employerGrantDetails.vestingTranches;
  const grantDate = holding.employerGrantDetails.grantDate;
  const holdingQuantity = holding.quantity ?? 0;
  const [template, setTemplate] = useState<Record<keyof VestingTemplate, number | null>>(
    DEFAULT_VESTING_TEMPLATE,
  );

  const listed = tranches.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0);
  const vestedNow = vestedQuantityAt(holding, engineNowMs());
  const generated = generateVestingSchedule(grantDate ?? "", holdingQuantity, {
    batches: template.batches ?? 0,
    everyMonths: template.everyMonths ?? 0,
    firstVestMonths: template.firstVestMonths ?? -1,
  });

  function patchTranche(id: string, patch: Partial<VestingTranche>) {
    onChange(tranches.map((tranche) => (tranche.id === id ? { ...tranche, ...patch } : tranche)));
  }

  function patchTemplate(patch: Partial<Record<keyof VestingTemplate, number | null>>) {
    setTemplate((current) => ({ ...current, ...patch }));
  }

  function generate() {
    onChange(
      generated.map((batch) => ({
        ...createEmptyVestingTranche(),
        vestDate: batch.vestDate,
        quantity: batch.quantity,
      })),
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">{f("title")}</h4>
        <p className="mt-1 text-xs text-slate-500">{f("intro")}</p>
      </div>

      <section
        className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
        aria-label={f("generateTitle")}
      >
        <div>
          <span className="text-xs font-semibold text-slate-600">{f("generateTitle")}</span>
          <p className="mt-1 text-xs text-slate-500">{f("generateIntro")}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            label={f("generateBatches")}
            value={template.batches}
            onChange={(batches) => patchTemplate({ batches })}
            min={1}
            max={MAX_TEMPLATE_BATCHES}
            step={1}
          />
          <NumberField
            label={f("generateEvery")}
            value={template.everyMonths}
            onChange={(everyMonths) => patchTemplate({ everyMonths })}
            min={1}
            step={1}
          />
          <NumberField
            label={f("generateFirst")}
            value={template.firstVestMonths}
            onChange={(firstVestMonths) => patchTemplate({ firstVestMonths })}
            min={0}
            step={1}
          />
        </div>
        {generated.length === 0 ? (
          <p className="text-xs text-slate-500">{f("generateNeeds")}</p>
        ) : (
          <p className="text-xs text-slate-500">
            {f("generatePreview", {
              count: generated.length,
              first: formatDate(generated[0].vestDate),
              last: formatDate(generated[generated.length - 1].vestDate),
            })}
          </p>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={generated.length === 0}
          className="self-start rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tranches.length > 0 ? f("generateReplace") : f("generate")}
        </button>
      </section>

      {tranches.map((tranche, index) => (
        <div
          key={tranche.id}
          className="flex flex-col gap-3 rounded-md bg-slate-50 p-3"
          role="group"
          aria-label={f("batch", { n: index + 1 })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">
              {f("batch", { n: index + 1 })}
            </span>
            <button
              type="button"
              onClick={() => onChange(tranches.filter((other) => other.id !== tranche.id))}
              className="text-xs font-medium text-rose-600 hover:text-rose-700"
            >
              {f("remove")}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <DateField
              label={f("vestDate")}
              importance="recommended"
              value={tranche.vestDate}
              onChange={(vestDate) => patchTranche(tranche.id, { vestDate })}
            />
            <NumberField
              label={f("quantity")}
              importance="recommended"
              value={tranche.quantity}
              onChange={(quantity) => patchTranche(tranche.id, { quantity })}
              min={0}
            />
            <NumberField
              label={f("grantPrice")}
              importance="reference"
              helperText={f("grantPriceHelper")}
              value={tranche.grantPriceUSD}
              onChange={(grantPriceUSD) => patchTranche(tranche.id, { grantPriceUSD })}
              suffix="$"
              min={0}
            />
          </div>
        </div>
      ))}

      {listed > holdingQuantity && (
        <p className="text-xs text-amber-700" role="status">
          {f("exceeds", { listed, quantity: holdingQuantity })}
        </p>
      )}

      {listed > 0 && (
        <p className="text-xs text-slate-600">
          {f("summary", {
            vested: round2(vestedNow),
            unvested: round2(Math.max(holdingQuantity - vestedNow, 0)),
          })}
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange([...tranches, createEmptyVestingTranche()])}
        className="self-start rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
      >
        {f("add")}
      </button>
    </div>
  );
}
