import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useProfile } from "../../app/ProfileContext";
import { ConfirmModal } from "../../components/ConfirmModal";
import { countSampleAccounts, removeSampleImport } from "../../domain/clearingHouseImport";
import { SampleBadge } from "./SampleBanner";

/**
 * Shown on every page for as long as made-up accounts from the sample report are in the plan,
 * so no figure can be mistaken for the user's own. It also takes the sample back out.
 */
export function SampleDataBanner() {
  const { t } = useTranslation();
  const { profile, updateProfile } = useProfile();
  const [confirming, setConfirming] = useState(false);
  const count = countSampleAccounts(profile);
  if (count === 0) return null;

  return (
    <>
      <div
        role="note"
        aria-label={t("clearingHouse.sample.dataTitle")}
        className="mb-4 flex flex-col gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3 sm:flex-row sm:items-center"
      >
        <SampleBadge />
        <div className="flex flex-1 flex-col gap-0.5">
          <p className="text-sm font-semibold text-amber-900">{t("clearingHouse.sample.dataTitle")}</p>
          <p className="text-xs text-amber-900">{t("clearingHouse.sample.dataBody", { count })}</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded-md border border-amber-500 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 sm:self-auto"
        >
          {t("clearingHouse.sample.remove")}
        </button>
      </div>
      <ConfirmModal
        open={confirming}
        title={t("clearingHouse.sample.removeConfirmTitle")}
        body={t("clearingHouse.sample.removeConfirmBody")}
        confirmLabel={t("clearingHouse.sample.remove")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          updateProfile(removeSampleImport(profile));
          setConfirming(false);
        }}
      />
    </>
  );
}
