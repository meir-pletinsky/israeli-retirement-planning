import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";

import { LanguageSwitcher } from "../components/LanguageSwitcher";

const NAV_ITEMS = [
  { to: "/dashboard", key: "nav.dashboard", icon: "🏠" },
  { to: "/my-data", key: "nav.myData", icon: "📝" },
  { to: "/projections", key: "nav.projections", icon: "📈" },
  { to: "/settings", key: "nav.settings", icon: "⚙️" },
] as const;

export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      <aside className="hidden w-60 shrink-0 border-e border-slate-200 bg-white p-4 md:flex md:flex-col">
        <div className="mb-6 px-2 text-lg font-semibold text-slate-900">
          {t("common.appName")}
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              <span aria-hidden>{item.icon}</span>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <span className="text-base font-semibold text-slate-900 md:hidden">
            {t("common.appName")}
          </span>
          <div className="ms-auto">
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex flex-col items-center gap-0.5 py-2 text-xs font-medium",
                isActive ? "text-teal-700" : "text-slate-500",
              )
            }
          >
            <span aria-hidden className="text-lg">
              {item.icon}
            </span>
            {t(item.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
