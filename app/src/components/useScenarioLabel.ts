import { useTranslation } from "react-i18next";

import { resolveRetirementAge } from "../domain";
import type { ProfileData, RetirementScenario } from "../types";
import { useFormatAge } from "./useFormatAge";

function scenarioNameKey(scenario: RetirementScenario): string {
  return `projections.scenario${scenario.charAt(0).toUpperCase()}${scenario.slice(1)}`;
}

/** "Early - age 55": a scenario's name with the retirement age it stands for in this plan. */
export function useScenarioLabel(profile: ProfileData): (scenario: RetirementScenario) => string {
  const { t } = useTranslation();
  const formatAge = useFormatAge();
  return (scenario) =>
    t("projections.scenarioOption", {
      name: t(scenarioNameKey(scenario)),
      age: formatAge(resolveRetirementAge(profile, scenario)),
    });
}
