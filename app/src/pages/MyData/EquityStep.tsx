import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { ConfirmModal } from "../../components/ConfirmModal";
import { FormModal } from "../../components/FormModal";
import { usdToIlsRate } from "../../domain";
import {
  createEmptyBankDeposit,
  type BankDeposit,
  type InvestmentCategory,
  type StockHolding,
} from "../../types";
import { BankDepositForm } from "./BankDepositForm";
import { BankDepositsTable } from "./BankDepositsTable";
import { EquityCategoryTable, EquityStepTotal, EquityTotalsFooter } from "./EquitySummaryTable";
import { HoldingDialog } from "./HoldingDialog";
import { CATEGORY_ORDER, createHoldingForCategory } from "./holdingEntry";
import { StepFooter } from "./StepFooter";

/** Each stock table's own "Add" button label and empty-state message key. */
const CATEGORY_COPY: Record<InvestmentCategory, { add: string; empty: string }> = {
  employerGrantedStock: { add: "addEsop", empty: "noEsop" },
  employerEsppDiscount: { add: "addEspp", empty: "noEspp" },
  personalBrokeragePurchase: { add: "addPrivateTrade", empty: "noPrivateTrade" },
};

export function EquityStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { equity, bankDeposits } = profile;
  const rate = usdToIlsRate(profile);

  const [editingHolding, setEditingHolding] = useState<StockHolding | null>(null);
  const [removingHoldingId, setRemovingHoldingId] = useState<string | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<BankDeposit | null>(null);
  const [removingDepositId, setRemovingDepositId] = useState<string | null>(null);

  function saveHoldings(holdings: StockHolding[]) {
    updateProfile({ equity: { ...equity, holdings } });
  }

  function handleSaveHoldings(saved: StockHolding[]) {
    const byId = new Map(saved.map((h) => [h.id, h]));
    const replaced = equity.holdings.map((h) => byId.get(h.id) ?? h);
    const added = saved.filter((h) => !equity.holdings.some((existing) => existing.id === h.id));
    saveHoldings([...replaced, ...added]);
    setEditingHolding(null);
  }

  function handleRemoveHolding(id: string) {
    saveHoldings(equity.holdings.filter((h) => h.id !== id));
    setRemovingHoldingId(null);
  }

  function saveDeposits(deposits: BankDeposit[]) {
    updateProfile({ bankDeposits: deposits });
  }

  function handleSaveDeposit() {
    if (!editingDeposit) return;
    const exists = bankDeposits.some((d) => d.id === editingDeposit.id);
    const deposits = exists
      ? bankDeposits.map((d) => (d.id === editingDeposit.id ? editingDeposit : d))
      : [...bankDeposits, editingDeposit];
    saveDeposits(deposits);
    setEditingDeposit(null);
  }

  function handleRemoveDeposit(id: string) {
    saveDeposits(bankDeposits.filter((d) => d.id !== id));
    setRemovingDepositId(null);
  }

  // Legacy holdings saved before a category existed; kept visible (read-only table, no "Add"
  // button of its own) so nothing already entered is lost. New holdings always start categorized.
  const uncategorized = equity.holdings.filter((h) => h.investmentCategory === null);
  const nonEmptyTableCount =
    CATEGORY_ORDER.filter((category) =>
      equity.holdings.some((h) => h.investmentCategory === category),
    ).length + (uncategorized.length > 0 ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900">
        {t("myData.steps.equity.holdingsTitle")}
      </h2>

      {CATEGORY_ORDER.map((category) => {
        const holdings = equity.holdings.filter((h) => h.investmentCategory === category);
        const copy = CATEGORY_COPY[category];
        return (
          <EquityCategoryTable
            key={category}
            category={category}
            holdings={holdings}
            rate={rate}
            onEdit={setEditingHolding}
            onRemove={(holding) => setRemovingHoldingId(holding.id)}
            emptyMessage={
              <p className="text-sm text-slate-500">{t(`myData.steps.equity.${copy.empty}`)}</p>
            }
            toolbar={
              <button
                type="button"
                onClick={() => setEditingHolding(createHoldingForCategory(category, holdings))}
                className="btn btn-sm btn-primary"
              >
                {t(`myData.steps.equity.${copy.add}`)}
              </button>
            }
          />
        );
      })}

      {uncategorized.length > 0 && (
        <EquityCategoryTable
          category={null}
          holdings={uncategorized}
          rate={rate}
          onEdit={setEditingHolding}
          onRemove={(holding) => setRemovingHoldingId(holding.id)}
          emptyMessage={null}
        />
      )}

      <EquityTotalsFooter holdings={equity.holdings} nonEmptyTableCount={nonEmptyTableCount} />

      <BankDepositsTable
        deposits={bankDeposits}
        onEdit={setEditingDeposit}
        onRemove={(deposit) => setRemovingDepositId(deposit.id)}
        emptyMessage={
          <p className="text-sm text-slate-500">{t("myData.steps.bankDeposits.noDeposits")}</p>
        }
        toolbar={
          <button
            type="button"
            onClick={() => setEditingDeposit(createEmptyBankDeposit())}
            className="btn btn-sm btn-primary"
          >
            {t("myData.steps.bankDeposits.addDeposit")}
          </button>
        }
      />

      <EquityStepTotal holdings={equity.holdings} deposits={bankDeposits} />

      <div className="max-w-lg">
        <StepFooter currentKey="equity" />
      </div>

      {editingHolding && (
        <HoldingDialog
          key={editingHolding.id}
          holding={editingHolding}
          isNew={!equity.holdings.some((h) => h.id === editingHolding.id)}
          onClose={() => setEditingHolding(null)}
          onSave={handleSaveHoldings}
        />
      )}

      <ConfirmModal
        open={removingHoldingId !== null}
        title={t("myData.steps.equity.removeConfirmTitle")}
        body={t("myData.steps.equity.removeConfirmBody")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRemovingHoldingId(null)}
        onConfirm={() => removingHoldingId && handleRemoveHolding(removingHoldingId)}
      />

      <FormModal
        open={editingDeposit !== null}
        title={t("myData.steps.bankDeposits.formTitle")}
        closeLabel={t("common.close")}
        onClose={() => setEditingDeposit(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingDeposit(null)}
              className="btn btn-ghost text-slate-700 hover:bg-slate-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSaveDeposit}
              className="btn btn-primary"
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        {editingDeposit && (
          <BankDepositForm
            deposit={editingDeposit}
            onChange={(change) =>
              setEditingDeposit((current) => (current ? { ...current, ...change } : current))
            }
          />
        )}
      </FormModal>

      <ConfirmModal
        open={removingDepositId !== null}
        title={t("myData.steps.bankDeposits.removeConfirmTitle")}
        body={t("myData.steps.bankDeposits.removeConfirmBody")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRemovingDepositId(null)}
        onConfirm={() => removingDepositId && handleRemoveDeposit(removingDepositId)}
      />
    </div>
  );
}
