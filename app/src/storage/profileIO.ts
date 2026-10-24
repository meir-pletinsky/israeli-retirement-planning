import { normalizeProfile, type ProfileData } from "../types";

const EXPORT_FILENAME_PREFIX = "israeli-retirement-planning";

/** Triggers a browser download of the given profile as a timestamped JSON file. */
export function exportProfileToFile(profile: ProfileData): void {
  const json = JSON.stringify(profile, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${EXPORT_FILENAME_PREFIX}-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Top-level keys a plausible profile export should have at least one of. */
const PROFILE_SHAPE_KEYS: (keyof ProfileData)[] = [
  "personal",
  "taxExemptionBasket",
  "pensionSavings",
  "equity",
  "expenses",
  "assumptions",
];

/**
 * Parses and loosely validates an uploaded JSON file, returning a fully
 * normalized `ProfileData` (missing/mismatched fields fall back to safe
 * defaults via `normalizeProfile`). Throws if the file isn't readable JSON
 * or doesn't look like a profile export at all.
 */
export async function importProfileFromFile(
  file: File,
): Promise<ProfileData> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const isPlausibleProfile =
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    PROFILE_SHAPE_KEYS.some((key) => key in (parsed as Record<string, unknown>));

  if (!isPlausibleProfile) {
    throw new Error(
      "This file doesn't look like an Israeli Retirement Planning export.",
    );
  }

  return normalizeProfile(parsed as Partial<ProfileData>);
}
