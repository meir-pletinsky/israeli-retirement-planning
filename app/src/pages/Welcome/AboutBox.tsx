import { useTranslation } from "react-i18next";

import { CheckIcon, InfoIcon, WelcomeCard } from "./WelcomeCard";

const POINTS = ["income", "earliest", "rules", "scenarios"] as const;

/** What the app does, in a few lines, and how the export file lets a user come back later. */
export function AboutBox() {
  const { t } = useTranslation();
  return (
    <WelcomeCard titleId="welcome-about-title" title={t("welcome.about.title")} icon={<InfoIcon />}>
      <p>{t("welcome.about.body")}</p>
      <ul className="flex flex-col gap-1.5">
        {POINTS.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-0.5 text-brand-600 [&>svg]:h-4 [&>svg]:w-4">
              <CheckIcon />
            </span>
            <span>{t(`welcome.about.points.${point}`)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto rounded-lg bg-slate-50 p-3">
        <p className="font-semibold text-slate-800">{t("welcome.about.saveTitle")}</p>
        <p className="mt-1 text-slate-600">{t("welcome.about.saveBody")}</p>
      </div>
    </WelcomeCard>
  );
}
