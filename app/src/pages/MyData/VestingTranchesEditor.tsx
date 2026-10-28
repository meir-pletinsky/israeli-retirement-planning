import { useTranslation } from "react-i18next";

import { DateField } from "../../components/fields/DateField";
import { NumberField } from "../../components/fields/NumberField";
import { createEmptyVestingTranche, type VestingTranche } from "../../types";

interface VestingTranchesEditorProps {
  tranches: VestingTranche[];
  /** Shares in the whole holding, which the batches are part of. */
  holdingQuantity: number;
  onChange: (tranches: VestingTranche[]) => void;
}

export function VestingTranchesEditor({
  tranches,
  holdingQuantity,
  onChange,
}: VestingTranchesEditorProps) {
  const { t } = useTranslation();
  const f = (key: string, params?: Record<string, unknown>) =>
    t(`myData.steps.equity.tranches.${key}`, params);

  const listed = tranches.reduce((sum, tranche) => sum + (tranche.quantity ?? 0), 0);

  function patchTranche(id: string, patch: Partial<VestingTranche>) {
    onChange(tranches.map((tranche) => (tranche.id === id ? { ...tranche, ...patch } : tranche)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-3">
      <div>
        <h4 className="text-sm font-semibold text-slate-700">{f("title")}</h4>
        <p className="mt-1 text-xs text-slate-500">{f("intro")}</p>
      </div>

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

      <button
        type="button"
        onClick={() => onChange([...tranches, createEmptyVestingTranche()])}
        className="self-start rounded-md border border-teal-600 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
      >
        {f("add")}
      </button>
    </div>
  );
}
