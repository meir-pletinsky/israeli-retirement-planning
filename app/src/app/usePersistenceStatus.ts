import { useCallback, useEffect, useState } from "react";

import {
  readPersistenceStatus,
  requestPersistentStorage,
  type PersistenceStatus,
} from "../storage/persistentStorage";

/**
 * Whether the browser has agreed to keep the plan (null while that is being read), and a way to
 * ask it again. `declined` is true once an explicit ask was answered with a no.
 */
export function usePersistenceStatus(): {
  status: PersistenceStatus | null;
  declined: boolean;
  ask: () => Promise<void>;
} {
  const [status, setStatus] = useState<PersistenceStatus | null>(null);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void readPersistenceStatus().then((read) => {
      if (!cancelled) setStatus(read);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ask = useCallback(async () => {
    const answer = await requestPersistentStorage();
    setStatus(answer);
    setDeclined(answer !== "persisted");
  }, []);

  return { status, declined, ask };
}
