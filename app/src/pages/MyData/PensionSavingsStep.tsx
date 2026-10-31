import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import { ConfirmModal } from "../../components/ConfirmModal";
import { FormModal } from "../../components/FormModal";
import { NumberField } from "../../components/fields/NumberField";
import { isHouseholdActive } from "../../domain";
import { createEmptyPensionAccount, type PensionAccount } from "../../types";
import { PensionAccountCard } from "./PensionAccountCard";
import { PensionAccountForm } from "./PensionAccountForm";
import { StepFooter } from "./StepFooter";

export function PensionSavingsStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { pensionSavings } = profile;
  const currency = t("common.currencySymbol");
  const householdActive = isHouseholdActive(profile);
  // Accounts can belong to either spouse; keep showing the owner if any
  // account is still marked as the spouse's after a status change.
  const showOwner =
    profile.personal.maritalStatus === "married" ||
    pensionSavings.accounts.some((account) => account.owner === "spouse");

  const [editingAccount, setEditingAccount] = useState<PensionAccount | null>(
    null,
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  function saveAccounts(accounts: PensionAccount[]) {
    updateProfile({ pensionSavings: { ...pensionSavings, accounts } });
  }

  function handleSave() {
    if (!editingAccount) return;
    const exists = pensionSavings.accounts.some(
      (a) => a.id === editingAccount.id,
    );
    const accounts = exists
      ? pensionSavings.accounts.map((a) =>
          a.id === editingAccount.id ? editingAccount : a,
        )
      : [...pensionSavings.accounts, editingAccount];
    saveAccounts(accounts);
    setEditingAccount(null);
  }

  function handleRemove(id: string) {
    saveAccounts(pensionSavings.accounts.filter((a) => a.id !== id));
    setRemovingId(null);
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("myData.steps.pensionSavings.accountsTitle")}
        </h2>
        <button
          type="button"
          onClick={() => setEditingAccount(createEmptyPensionAccount())}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {t("myData.steps.pensionSavings.addAccount")}
        </button>
      </div>

      <section
        aria-labelledby="clearing-house-entry-title"
        className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/60 p-3"
      >
        <h3 id="clearing-house-entry-title" className="text-sm font-semibold text-brand-900">
          {t("clearingHouse.entryTitle")}
        </h3>
        <p className="text-xs leading-relaxed text-slate-600">{t("clearingHouse.entryBody")}</p>
        <Link
          to="/import/clearing-house"
          className="self-start rounded-md border border-brand-600 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          {t("clearingHouse.entryButton")}
        </Link>
      </section>

      {pensionSavings.accounts.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          {t("myData.steps.pensionSavings.noAccounts")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pensionSavings.accounts.map((account) => (
            <PensionAccountCard
              key={account.id}
              account={account}
              currencySymbol={currency}
              showOwner={showOwner}
              notCounted={account.owner === "spouse" && !householdActive}
              onEdit={() => setEditingAccount(account)}
              onRemove={() => setRemovingId(account.id)}
            />
          ))}
        </div>
      )}

      <NumberField
        label={t("myData.steps.pensionSavings.otherAssets")}
        value={pensionSavings.otherAssets}
        onChange={(otherAssets) =>
          updateProfile({ pensionSavings: { ...pensionSavings, otherAssets } })
        }
        suffix={currency}
      />

      <StepFooter currentKey="pension-savings" />

      <FormModal
        open={editingAccount !== null}
        title={t("myData.steps.pensionSavings.accountFormTitle")}
        closeLabel={t("common.close")}
        onClose={() => setEditingAccount(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingAccount(null)}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              {t("common.save")}
            </button>
          </>
        }
      >
        {editingAccount && (
          <PensionAccountForm
            account={editingAccount}
            showOwner={showOwner}
            onChange={(patch) =>
              setEditingAccount({ ...editingAccount, ...patch })
            }
          />
        )}
      </FormModal>

      <ConfirmModal
        open={removingId !== null}
        title={t("myData.steps.pensionSavings.removeConfirmTitle")}
        body={t("myData.steps.pensionSavings.removeConfirmBody")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRemovingId(null)}
        onConfirm={() => removingId && handleRemove(removingId)}
      />
    </div>
  );
}
