import { createContext, useContext } from "react";

import type { RetirementScenario } from "../types";

interface ChosenScenario {
  scenario: RetirementScenario;
  setScenario: (scenario: RetirementScenario) => void;
}

/**
 * The retirement scenario picked on Projections. It lives in the provider, not in the page, so it
 * survives leaving and coming back while the app is open. It is a view choice, not part of the
 * profile, so it is not saved or exported.
 */
export const ChosenScenarioContext = createContext<ChosenScenario>({
  scenario: "standard",
  setScenario: () => {},
});

export function useChosenScenario(): ChosenScenario {
  return useContext(ChosenScenarioContext);
}
