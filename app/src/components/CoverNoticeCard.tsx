import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import type { CoverAnalysis } from "../domain";
import { useFormatAge } from "./useFormatAge";

interface CoverNoticeCardProps {
  notices: CoverAnalysis[];
}

const oneDecimal = (value: number) => String(Math.round(value * 10) / 10);

/** People whose death cover lapses before it is needed and who have not yet chosen what to do. */
export function CoverNoticeCard({ notices }: CoverNoticeCardProps) {
  const { t } = useTranslation();
  const formatAge = useFormatAge();

  if (notices.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="cover-notice-title"
      className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm"
    >
      <h2 id="cover-notice-title" className="text-sm font-semibold text-slate-700">
        {t("dashboard.coverNotice.title")}
      </h2>
      <p className="mt-1 text-xs text-slate-500">{t("dashboard.coverNotice.intro")}</p>

      <ul className="mt-3 flex flex-col gap-2">
        {notices.map((notice) => (
          <li
            key={notice.person}
            className="flex flex-col gap-0.5 text-sm text-slate-700 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span>
              {t(`dashboard.coverNotice.item.${notice.person}`, {
                endAge: formatAge(notice.windows.gapStartAge),
                needAge: formatAge(notice.windows.needEndAge),
                years: oneDecimal(notice.windows.gapYears),
                count: Number(oneDecimal(notice.windows.gapYears)),
              })}
            </span>
            <Link
              to="/my-data/personal"
              className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
            >
              {t("dashboard.coverNotice.choose")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
