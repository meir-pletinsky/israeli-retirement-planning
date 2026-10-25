import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { ProfileProvider } from "../app/ProfileContext";
import "../i18n";

/**
 * Renders a component tree wrapped the same way `main.tsx` wraps the real
 * app (router + profile context), using `fake-indexeddb` (see
 * `src/test/setup.ts`) so `ProfileProvider`'s real Dexie-backed load/save
 * path runs unmodified in tests. Seed data via `storage/db.ts` (e.g.
 * `db.profile.put(...)`) *before* calling this, then `await screen.find...`
 * for content, since `ProfileProvider` renders `null` until its async
 * IndexedDB load resolves.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProfileProvider>{ui}</ProfileProvider>
    </MemoryRouter>,
  );
}
