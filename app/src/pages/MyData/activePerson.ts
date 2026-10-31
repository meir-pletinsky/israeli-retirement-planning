import { createContext, useContext, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { AccountOwner } from "../../types";

/** The two people a household plan can cover. */
export type Person = AccountOwner;

/** The query parameter that opens a My Data step on a given person, e.g. after importing their report. */
export const PERSON_PARAM = "person";

export function parsePerson(value: string | null): Person | null {
  return value === "self" || value === "spouse" ? value : null;
}

export interface ActivePerson {
  person: Person;
  setPerson: (person: Person) => void;
}

export const ActivePersonContext = createContext<ActivePerson | null>(null);

export function useInitialPerson(): Person {
  const [searchParams] = useSearchParams();
  return parsePerson(searchParams.get(PERSON_PARAM)) ?? "self";
}

/** The person being edited; a step shown outside the My Data layout keeps its own selection. */
export function useActivePerson(): ActivePerson {
  const shared = useContext(ActivePersonContext);
  const initial = useInitialPerson();
  const [person, setPerson] = useState<Person>(initial);
  return shared ?? { person, setPerson };
}
