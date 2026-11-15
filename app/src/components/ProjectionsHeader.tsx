import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { useProfile } from "../app/ProfileContext";
import { ActiveAssumptions } from "./ActiveAssumptions";
import { AssumedRetirementAgeBanner } from "./AssumedRetirementAgeBanner";
import { Stepper } from "./Stepper";

const TABS = [
  { key: "plan", path: "/projections" },
  { key: "whatIf", path: "/projections/what-if" },
] as const;

/**
 * The page heading, the switch between the plan's projections and the what-if page, and the
 * assumptions both rest on. It renders as a fragment so the heading stays a direct child of the
 * page, next to the sticky plan bar.
 */
export function ProjectionsHeader() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const current = pathname.endsWith("/what-if") ? "whatIf" : "plan";
  const steps = TABS.map((tab) => ({
    key: tab.key,
    label: t(`projections.tabs.${tab.key}.label`),
    status: t(`projections.tabs.${tab.key}.status`),
  }));

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("projections.title")}</h1>
      <Stepper
        fit
        steps={steps}
        currentKey={current}
        onStepClick={(key) => navigate(TABS.find((tab) => tab.key === key)?.path ?? "/projections")}
      />
      <AssumedRetirementAgeBanner />
      <ActiveAssumptions assumptions={profile.assumptions} />
    </>
  );
}
