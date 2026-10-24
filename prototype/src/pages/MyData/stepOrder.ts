export const STEP_ORDER = [
  "personal",
  "pension-savings",
  "equity",
  "expenses",
  "assumptions",
] as const;

export type StepKey = (typeof STEP_ORDER)[number];

export function nextStep(key: StepKey): StepKey | null {
  const idx = STEP_ORDER.indexOf(key);
  return idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : null;
}

export function prevStep(key: StepKey): StepKey | null {
  const idx = STEP_ORDER.indexOf(key);
  return idx > 0 ? STEP_ORDER[idx - 1] : null;
}
