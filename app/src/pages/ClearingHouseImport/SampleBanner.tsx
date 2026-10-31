import { useTranslation } from "react-i18next";

/** Marks everything shown from the bundled sample report, so it cannot be mistaken for the user's own. */
export function SampleBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
      {t("clearingHouse.sample.badge")}
    </span>
  );
}

export function SampleBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3"
    >
      <SampleBadge />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-amber-900">{t("clearingHouse.sample.bannerTitle")}</p>
        <p className="text-xs text-amber-900">{t("clearingHouse.sample.bannerBody")}</p>
      </div>
    </div>
  );
}
