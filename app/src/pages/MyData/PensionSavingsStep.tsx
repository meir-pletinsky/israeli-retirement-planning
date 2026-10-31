import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import { ConfirmModal } from "../../components/ConfirmModal";
import { FormModal } from "../../components/FormModal";
import { NumberField } from "../../components/fields/NumberField";
import { aggregatePensionBalance, isHouseholdActive } from "../../domain";
import { createEmptyPensionAccount, type PensionAccount } from "../../types";
import { useActivePerson, type Person } from "./activePerson";
import { FieldLegend } from "./FieldLegend";
import { PensionAccountCard } from "./PensionAccountCard";
import { PensionAccountForm } from "./PensionAccountForm";
import { PensionSummaryTable } from "./PensionSummaryTable";
import { accountsOf, sumBalances } from "./pensionPeople";
import { PersonTabs, type PersonTab } from "./PersonTabs";
import { StepFooter } from "./StepFooter";
import { formatCurrency } from "./summaryFormat";

const PEOPLE: Person[] = ["self", "spouse"];
const FIELDS = "myData.steps.pensionSavings";

export function PensionSavingsStep() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const { pensionSavings } = profile;
  const { accounts } = pensionSavings;
  const currency = t("common.currencySymbol");
  const householdActive = isHouseholdActive(profile);
  const isMarried = profile.personal.maritalStatus === "married";
  // Accounts can belong to either person; keep the partner's tab while any
  // account is still marked as theirs after a status change.
  const showPeople = isMarried || accounts.some((account) => account.owner === "spouse");

  const { person: selectedPerson, setPerson } = useActivePerson();
  const person: Person = showPeople ? selectedPerson : "self";
  const visibleAccounts = accountsOf(accounts, person);

  const [editingAccount, setEditingAccount] = useState<PensionAccount | null>(
    null,
  );
  const [removingId, setRemovingId] = useState<string | null>(null);

  function saveAccounts(next: PensionAccount[]) {
    updateProfile({ pensionSavings: { ...pensionSavings, accounts: next } });
  }

  function handleSave() {
    if (!editingAccount) return;
    const exists = accounts.some((a) => a.id === editingAccount.id);
    saveAccounts(
      exists
        ? accounts.map((a) => (a.id === editingAccount.id ? editingAccount : a))
        : [...accounts, editingAccount],
    );
    // Follow an account that was moved to the other person.
    if (showPeople) setPerson(editingAccount.owner);
    setEditingAccount(null);
  }

  function handleRemove(id: string) {
    saveAccounts(accounts.filter((a) => a.id !== id));
    setRemovingId(null);
  }

  const tabs: PersonTab[] = PEOPLE.map((p) => {
    const own = accountsOf(accounts, p);
    return {
      person: p,
      detail: own.length === 0 ? t("myData.person.noAccounts") : formatCurrency(sumBalances(own), currency),
    };
  });

  const importTarget = showPeople ? `/import/clearing-house?owner=${person}` : "/import/clearing-house";

  const panel = (
    <>
      {showPeople && person === "spouse" && !householdActive && (
        <p
          role="note"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          {t(isMarried ? `${FIELDS}.partnerNotCountedMarried` : `${FIELDS}.partnerNotCountedUnmarried`)}{" "}
          <Link to="/my-data/personal" className="font-semibold underline">
            {t(`${FIELDS}.goToPersonal`)}
          </Link>
        </p>
      )}

      <PensionSummaryTable accounts={visibleAccounts} />

      <div className="flex max-w-lg flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {t(showPeople ? `${FIELDS}.accountsTitleFor.${person}` : `${FIELDS}.accountsTitle`)}
          </h2>
          <button
            type="button"
            onClick={() => setEditingAccount({ ...createEmptyPensionAccount(), owner: person })}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            {t(`${FIELDS}.addAccount`)}
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
            to={importTarget}
            className="self-start rounded-md border border-brand-600 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t(showPeople ? `clearingHouse.entryButtonFor.${person}` : "clearingHouse.entryButton")}
          </Link>
        </section>

        {visibleAccounts.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            {t(person === "spouse" ? `${FIELDS}.noAccountsSpouse` : `${FIELDS}.noAccounts`)}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleAccounts.map((account) => (
              <PensionAccountCard
                key={account.id}
                account={account}
                currencySymbol={currency}
                onEdit={() => setEditingAccount(account)}
                onRemove={() => setRemovingId(account.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      {showPeople && (
        <p className="text-sm text-slate-700">
          {t("myData.person.householdTotal")}{" "}
          <span dir="ltr" className="font-semibold text-slate-900">
            {formatCurrency(aggregatePensionBalance(profile), currency)}
          </span>
        </p>
      )}

      {showPeople ? (
        <PersonTabs id="pension" tabs={tabs} active={person} onChange={setPerson}>
          {panel}
        </PersonTabs>
      ) : (
        <div className="flex flex-col gap-4">{panel}</div>
      )}

      <FieldLegend />

      <div className="flex max-w-lg flex-col gap-4">
        <NumberField
          label={t(`${FIELDS}.otherAssets`)}
          helperText={showPeople ? t(`${FIELDS}.otherAssetsShared`) : undefined}
          value={pensionSavings.otherAssets}
          onChange={(otherAssets) =>
            updateProfile({ pensionSavings: { ...pensionSavings, otherAssets } })
          }
          suffix={currency}
        />

        <StepFooter currentKey="pension-savings" />
      </div>

      <FormModal
        open={editingAccount !== null}
        title={
          showPeople
            ? t(`${FIELDS}.accountFormTitleFor`, {
                person: t(`myData.person.${editingAccount?.owner ?? person}`),
              })
            : t(`${FIELDS}.accountFormTitle`)
        }
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
            showOwner={showPeople}
            onChange={(patch) =>
              setEditingAccount({ ...editingAccount, ...patch })
            }
          />
        )}
      </FormModal>

      <ConfirmModal
        open={removingId !== null}
        title={t(`${FIELDS}.removeConfirmTitle`)}
        body={t(`${FIELDS}.removeConfirmBody`)}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setRemovingId(null)}
        onConfirm={() => removingId && handleRemove(removingId)}
      />
    </div>
  );
}
