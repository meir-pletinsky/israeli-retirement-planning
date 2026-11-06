import {
  normalizeProfile,
  PROFILE_SECTIONS,
  type ProfileData,
  type ProfileSection,
} from "../types";

const EXPORT_FILENAME_PREFIX = "israeli-retirement-planning";

/** Triggers a browser download of `json` as `<prefix>-<today>.json`. */
export function downloadJsonFile(json: string, nameSuffix = ""): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${EXPORT_FILENAME_PREFIX}${nameSuffix}-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Triggers a browser download of the given profile as a timestamped JSON file. */
export function exportProfileToFile(profile: ProfileData): void {
  downloadJsonFile(JSON.stringify(profile, null, 2));
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

export interface ProfileFile {
  /** The file's content, normalized: parts it lacks hold their empty defaults. */
  profile: ProfileData;
  /** The sections the file actually carries; the others only look empty because of the defaults. */
  sections: ProfileSection[];
}

/**
 * Parses and loosely validates an uploaded JSON file, returning a fully
 * normalized `ProfileData` (missing/mismatched fields fall back to safe
 * defaults via `normalizeProfile`) and which sections the file carried.
 * Throws if the file isn't readable JSON or doesn't look like a profile
 * export at all.
 */
export async function readProfileFile(file: File): Promise<ProfileFile> {
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

  const record = parsed as Record<string, unknown>;
  return {
    profile: normalizeProfile(parsed as Partial<ProfileData>),
    sections: PROFILE_SECTIONS.filter((section) => record[section] != null),
  };
}

export async function importProfileFromFile(
  file: File,
): Promise<ProfileData> {
  return (await readProfileFile(file)).profile;
}
