import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { DEFAULT_RETIREMENT_AGE, assumedRetirementAges } from "../domain";
import { RETIREMENT_AGE_TARGET } from "./retirementAgeTargets";

/**
 * Tells the user, above the figures, when a retirement age they never entered is being used,
 * so a default is not mistaken for their own choice. Renders nothing once both are entered.
 */
export function AssumedRetirementAgeBanner() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const assumed = assumedRetirementAges(profile);
  if (!assumed.self && !assumed.spouse) return null;

  const items = [
    {
      key: "self",
      show: assumed.self,
      text: t("assumedRetirementAge.self", { age: DEFAULT_RETIREMENT_AGE }),
      link: t("assumedRetirementAge.setSelf"),
      to: RETIREMENT_AGE_TARGET.self,
    },
    {
      key: "spouse",
      show: assumed.spouse,
      text: t("assumedRetirementAge.spouse", { age: DEFAULT_RETIREMENT_AGE }),
      link: t("assumedRetirementAge.setSpouse"),
      to: RETIREMENT_AGE_TARGET.spouse,
    },
  ].filter((item) => item.show);

  return (
    <div
      role="note"
      aria-label={t("assumedRetirementAge.label")}
      className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      {items.map((item) => (
        <p key={item.key} className="flex flex-wrap items-baseline gap-x-2">
          <span>{item.text}</span>
          <Link to={item.to} className="font-medium underline hover:no-underline">
            {item.link}
          </Link>
        </p>
      ))}
    </div>
  );
}
