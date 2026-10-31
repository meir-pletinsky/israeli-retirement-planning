import clsx from "clsx";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Person } from "./activePerson";

export interface PersonTab {
  person: Person;
  /** A short line under the name, such as the person's balance. */
  detail?: string;
  /** Marks a tab whose person has a problem to fix. */
  hasError?: boolean;
}

interface PersonTabsProps {
  /** Distinguishes the tabs of different steps in the document. */
  id: string;
  tabs: readonly PersonTab[];
  active: Person;
  onChange: (person: Person) => void;
  children: ReactNode;
}

// Each person has their own colour, always shown next to the person's name.
const ACCENTS: Record<Person, { tab: string; dot: string; panel: string }> = {
  self: {
    tab: "border-brand-300 border-t-brand-600 bg-brand-50 text-brand-900",
    dot: "bg-brand-600",
    panel: "border-brand-300 bg-brand-50",
  },
  spouse: {
    tab: "border-indigo-300 border-t-indigo-600 bg-indigo-50 text-indigo-900",
    dot: "bg-indigo-600",
    panel: "border-indigo-300 bg-indigo-50",
  },
};

/** Switches the page between the user and their partner; everything inside follows the choice. */
export function PersonTabs({ id, tabs, active, onChange, children }: PersonTabsProps) {
  const { t } = useTranslation();
  const people = tabs.map((tab) => tab.person);
  const tabId = (person: Person) => `${id}-tab-${person}`;
  const panelId = `${id}-panel`;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, person: Person) {
    const rtl = document.documentElement.dir === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    const index = people.indexOf(person);
    let next: Person | undefined;
    if (event.key === forward) next = people[(index + 1) % people.length];
    else if (event.key === backward) next = people[(index - 1 + people.length) % people.length];
    else if (event.key === "Home") next = people[0];
    else if (event.key === "End") next = people[people.length - 1];
    if (!next) return;
    event.preventDefault();
    onChange(next);
    document.getElementById(tabId(next))?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={t("myData.person.switcher")} className="flex gap-1">
        {tabs.map(({ person, detail, hasError }) => {
          const selected = person === active;
          return (
            <button
              key={person}
              id={tabId(person)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(person)}
              onKeyDown={(event) => handleKeyDown(event, person)}
              className={clsx(
                "relative rounded-t-lg border-2 border-b-0 px-4 py-2 text-start",
                selected
                  ? clsx("z-10 -mb-0.5 border-t-4 pb-2.5", ACCENTS[person].tab)
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden="true" className={clsx("h-2 w-2 rounded-full", ACCENTS[person].dot)} />
                {t(`myData.person.${person}`)}
                {hasError && (
                  <>
                    <span aria-hidden="true" className="rounded-full bg-red-600 px-1.5 text-xs text-white">
                      !
                    </span>
                    <span className="sr-only">{t("myData.person.needsAttention")}</span>
                  </>
                )}
              </span>
              {detail && <span className="block text-xs font-normal text-slate-600">{detail}</span>}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(active)}
        className={clsx("flex flex-col gap-4 rounded-xl rounded-ss-none border-2 p-4", ACCENTS[active].panel)}
      >
        {children}
      </div>
    </div>
  );
}
