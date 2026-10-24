import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { ConfirmModal } from "../../components/ConfirmModal";
import { FormModal } from "../../components/FormModal";
import { createEmptyStockHolding, type StockHolding } from "../../types";
import { EquityHoldingCard } from "./EquityHoldingCard";
import { EquityHoldingForm } from "./EquityHoldingForm";
import { StepFooter } from "./StepFooter";

export function EquityStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { equity } = profile;

  const [editingHolding, setEditingHolding] = useState<StockHolding | null>(
    null,
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  function saveHoldings(holdings: StockHolding[]) {
    updateProfile({ equity: { ...equity, holdings } });
  }

  function handleSave() {
    if (!editingHolding) return;
    const exists = equity.holdings.some((h) => h.id === editingHolding.id);
    const holdings = exists
      ? equity.holdings.map((h) =>
          h.id === editingHolding.id ? editingHolding : h,
        )
      : [...equity.holdings, editingHolding];
    saveHoldings(holdings);
    setEditingHolding(null);
  }

  function handleRemove(id: string) {
    saveHoldings(equity.holdings.filter((h) => h.id !== id));
    setRemovingId(null);
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("myData.steps.equity.holdingsTitle")}
        </h2>
        <button
          type="button"
          onClick={() => setEditingHolding(createEmptyStockHolding())}
          className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
        >
          {t("myData.steps.equity.addHolding")}
        </button>
      </div>

      {equity.holdings.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          {t("myData.steps.equity.noHoldings")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {equity.holdings.map((holding) => (
            <EquityHoldingCard
              key={holding.id}
              holding={holding}
              onEdit={() => setEditingHolding(holding)}
              onRemove={() => setRemovingId(holding.id)}
            />
          ))}
        </div>
      )}

      <StepFooter currentKey="equity" />

      <FormModal
        open={editingHolding !== null}
        title={t("myData.steps.equity.holdingFormTitle")}
        closeLabel={t("common.close")}
        onClose={() => setEditingHolding(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingHolding(null)}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        {editingHolding && (
          <EquityHoldingForm
            holding={editingHolding}
            onChange={(patch) =>
              setEditingHolding({ ...editingHolding, ...patch })
            }
          />
        )}
      </FormModal>

      <ConfirmModal
        open={removingId !== null}
        title={t("myData.steps.equity.removeConfirmTitle")}
        body={t("myData.steps.equity.removeConfirmBody")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRemovingId(null)}
        onConfirm={() => removingId && handleRemove(removingId)}
      />
    </div>
  );
}
