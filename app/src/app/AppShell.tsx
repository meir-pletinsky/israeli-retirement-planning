import clsx from "clsx";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet } from "react-router-dom";

import { BackupReminder } from "../components/BackupReminder";
import { BuildInfo } from "../components/BuildInfo";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { LogoMark } from "../components/LogoMark";
import { PrivacyBanner } from "../components/PrivacyBanner";
import { SampleDataBanner } from "../pages/ClearingHouseImport/SampleDataBanner";
import { useUsdToIlsRateRefresh } from "./useUsdToIlsRateRefresh";

/** One stroke icon set (24px grid, 1.75 stroke) replaces the platform emoji. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {children}
    </svg>
  );
}
const ICONS: Record<string, ReactNode> = {
  "/dashboard": <Icon><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>,
  "/my-data": <Icon><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" /><path d="M16 5h1.5A1.5 1.5 0 0 1 19 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H8" /><path d="M9 12h6M9 16h4" /></Icon>,
  "/projections": <Icon><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-6" /><path d="M16 8h4v4" /></Icon>,
  "/settings": <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></Icon>,
};

const NAV_ITEMS = [
  { to: "/dashboard", key: "nav.dashboard" },
  { to: "/my-data", key: "nav.myData" },
  { to: "/projections", key: "nav.projections" },
  { to: "/settings", key: "nav.settings" },
] as const;

export function AppShell() {
  const { t } = useTranslation();
  useUsdToIlsRateRefresh();

  return (
    <div className="flex min-h-screen flex-col bg-surface md:flex-row">
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-e border-slate-200 bg-white px-4 py-5 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:self-start">
        <Link
          to="/"
          className="mb-8 flex items-center gap-3 rounded-lg px-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          <LogoMark size={36} className="shrink-0" />
          <span className="text-sm font-semibold leading-tight tracking-tight text-slate-900">
            {t("common.appName")}
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 font-semibold text-brand-800 before:absolute before:inset-y-2 before:start-0 before:w-1 before:rounded-full before:bg-brand-600"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )
              }
            >
              {ICONS[item.to]}
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-3">
          <PrivacyBanner variant="card" />
          <LanguageSwitcher />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 md:hidden">
          <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
            <Link to="/" className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
              <LogoMark size={28} className="shrink-0" />
              <span className="truncate">{t("common.appName")}</span>
            </Link>
            <LanguageSwitcher />
          </header>
          <PrivacyBanner variant="strip" />
        </div>
        <main className="mx-auto w-full max-w-[76rem] flex-1 overflow-x-clip px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-10">
          <SampleDataBanner />
          <BackupReminder />
          <Outlet />
          <BuildInfo />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid min-h-[calc(4.5rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "group flex flex-col items-center justify-center gap-1 text-xs font-medium",
                isActive ? "font-semibold text-brand-800" : "text-slate-500",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={clsx("flex h-8 w-14 items-center justify-center rounded-full transition-colors", isActive ? "bg-brand-100 text-brand-800" : "")}>
                  {ICONS[item.to]}
                </span>
                {t(item.key)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
