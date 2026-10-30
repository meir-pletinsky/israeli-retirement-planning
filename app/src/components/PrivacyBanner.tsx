import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx("shrink-0", className)}
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * The privacy promise, shown on every page of the app and never dismissible. `card` is the full
 * wording for the desktop sidebar; `strip` is a single line under the mobile header.
 */
export function PrivacyBanner({ variant }: { variant: "card" | "strip" }) {
  const { t } = useTranslation();

  if (variant === "strip") {
    return (
      <Link
        to="/settings"
        className="flex items-center justify-center gap-1.5 border-b border-brand-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-800 md:hidden"
      >
        <LockIcon className="h-3.5 w-3.5" />
        {t("privacy.short")}
      </Link>
    );
  }

  return (
    <div
      role="note"
      aria-label={t("privacy.title")}
      className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-xs leading-relaxed text-brand-900"
    >
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-brand-800">
        <LockIcon />
        {t("privacy.title")}
      </p>
      <p>{t("privacy.body")}</p>
      <Link
        to="/settings"
        className="mt-1.5 inline-block font-medium text-brand-700 underline hover:text-brand-900"
      >
        {t("privacy.details")}
      </Link>
    </div>
  );
}
