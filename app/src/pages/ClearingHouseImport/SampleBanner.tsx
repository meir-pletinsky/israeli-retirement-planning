import { useTranslation } from "react-i18next";

/** Marks everything shown from the bundled sample report, so it cannot be mistaken for the user's own. */
export function SampleBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center self-start rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 sm:self-center">
      {t("clearingHouse.sample.badge")}
    </span>
  );
}

export function SampleBanner() {
  const { t } = useTranslation();
  return (
    <div
      role="note"
      className="notice border-amber-300 bg-amber-50"
    >
      <SampleBadge />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold text-amber-900">{t("clearingHouse.sample.bannerTitle")}</p>
        <p className="text-xs text-amber-900">{t("clearingHouse.sample.bannerBody")}</p>
      </div>
    </div>
  );
}
