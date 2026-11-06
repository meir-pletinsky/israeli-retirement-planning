import type { ReactNode } from "react";

import type { ProfileData, RetirementScenario } from "../types";
import { useScenarioLabel } from "./useScenarioLabel";

interface ScenarioTagProps {
  profile: ProfileData;
  scenario: RetirementScenario;
}

/** A small tag beside a card title saying which retirement scenario the card shows. */
export function ScenarioTag({ profile, scenario }: ScenarioTagProps) {
  const label = useScenarioLabel(profile)(scenario);
  return (
    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
      {label}
    </span>
  );
}

interface ScenarioTitleProps {
  id?: string;
  /** A `ScenarioTag`; kept outside the heading so the heading's own name stays the card's title. */
  tag?: ReactNode;
  children: ReactNode;
}

/** A card's `h2` with the scenario tag beside it. */
export function ScenarioTitle({ id, tag, children }: ScenarioTitleProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 id={id} className="text-sm font-semibold text-slate-700">
        {children}
      </h2>
      {tag}
    </div>
  );
}
