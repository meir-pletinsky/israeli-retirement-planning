import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

import { EMPTY_WHAT_IF_DRAFT, type WhatIfDraft } from "../domain";
import type { ProfileData } from "../types";

interface WhatIfDraftState {
  draft: WhatIfDraft;
  setDraft: Dispatch<SetStateAction<WhatIfDraft>>;
  /** Replaces the draft with one read from a backup file (null clears it), checked against the plan it goes with. */
  restoreDraft: (saved: unknown, profile: ProfileData) => void;
}

/**
 * The What if tab's draft. It lives in the provider so it survives leaving the tab, and is saved
 * to the browser and exported with the backup, but apart from the plan: the plan changes only
 * when the draft is applied.
 */
export const WhatIfDraftContext = createContext<WhatIfDraftState>({
  draft: EMPTY_WHAT_IF_DRAFT,
  setDraft: () => {},
  restoreDraft: () => {},
});

export function useWhatIfDraft(): WhatIfDraftState {
  return useContext(WhatIfDraftContext);
}
