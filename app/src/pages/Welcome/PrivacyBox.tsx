import { useTranslation } from "react-i18next";

import { LockIcon, WelcomeCard } from "./WelcomeCard";

const POINTS = ["local", "files", "lookups"] as const;

/** The privacy promise in full, for a visitor who has not entered anything yet. */
export function PrivacyBox() {
  const { t } = useTranslation();
  return (
    <WelcomeCard
      titleId="welcome-privacy-title"
      title={t("welcome.privacy.title")}
      icon={<LockIcon />}
      tone="brand"
    >
      <p className="font-medium">{t("welcome.privacy.lead")}</p>
      <ul className="flex list-disc flex-col gap-2 ps-5 marker:text-brand-500">
        {POINTS.map((point) => (
          <li key={point}>{t(`welcome.privacy.points.${point}`)}</li>
        ))}
      </ul>
    </WelcomeCard>
  );
}
