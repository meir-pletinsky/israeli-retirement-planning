import { useMemo, useState, type ReactNode } from "react";

import { ActivePersonContext, useInitialPerson, type Person } from "./activePerson";

/** Keeps the selected person while the user moves between My Data steps. */
export function ActivePersonProvider({ children }: { children: ReactNode }) {
  const initial = useInitialPerson();
  const [person, setPerson] = useState<Person>(initial);
  const value = useMemo(() => ({ person, setPerson }), [person]);
  return <ActivePersonContext.Provider value={value}>{children}</ActivePersonContext.Provider>;
}
