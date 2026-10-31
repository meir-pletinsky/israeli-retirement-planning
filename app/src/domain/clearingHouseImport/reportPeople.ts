import { sameIdNumber } from "./israeliId";
import type { ReportPerson } from "./types";

/** Fixed context for the fingerprints; changing it would stop old reports being recognised. */
const FINGERPRINT_SALT = "irp.clearing-house.person.v1";
const FINGERPRINT_ITERATIONS = 100_000;
const FINGERPRINT_BITS = 160;
const MAX_FIRST_NAME_LENGTH = 40;

/** A name as shown to the user: trimmed, single-spaced and of bounded length. */
export function cleanFirstName(value: string | null): string | null {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FIRST_NAME_LENGTH);
  return cleaned === "" ? null : cleaned;
}

/** A name as compared: no quote marks, spacing or letter case. */
function comparableName(value: string | null): string | null {
  const text = (value ?? "").normalize("NFC").replace(/["'`\u2019\u05f3\u05f4]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  return text === "" ? null : text;
}

/** The ID without formatting and leading zeros; null when nothing significant is left. */
export function significantId(value: string | null): string | null {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits === "" ? null : digits;
}

/**
 * Whether two customer blocks describe the same person. When both carry an ID number it decides.
 * Otherwise the names and birth date decide, and a part missing on either side does not count
 * against the match.
 */
export function samePerson(a: ReportPerson, b: ReportPerson): boolean {
  const idA = significantId(a.idNumber);
  const idB = significantId(b.idNumber);
  if (idA !== null && idB !== null) return sameIdNumber(idA, idB);
  const parts: [string | null, string | null][] = [
    [comparableName(a.firstName), comparableName(b.firstName)],
    [comparableName(a.familyName), comparableName(b.familyName)],
    [a.birthDate, b.birthDate],
  ];
  return parts.every(([left, right]) => left === null || right === null || left === right);
}

/** Adds a person to the list unless the same person is already there, and fills the gaps of the one that is. */
export function addPerson(people: ReportPerson[], person: ReportPerson): void {
  const known = people.find((candidate) => samePerson(candidate, person));
  if (!known) {
    people.push({ ...person, keys: [...person.keys] });
    return;
  }
  known.idNumber ??= person.idNumber;
  known.firstName ??= person.firstName;
  known.familyName ??= person.familyName;
  known.birthDate ??= person.birthDate;
  known.age ??= person.age;
}

/** True when two fingerprint sets share a value, meaning the reports are about the same person. */
export function sharesKey(a: readonly string[], b: readonly string[]): boolean {
  return a.some((key) => b.includes(key));
}

/** What identifies a person, before it is made one-way: the ID, and the name with the birth date. */
function identityParts(person: ReportPerson): string[] {
  const parts: string[] = [];
  const id = significantId(person.idNumber);
  if (id !== null) parts.push(`id:${id}`);
  const first = comparableName(person.firstName);
  const family = comparableName(person.familyName);
  if (first !== null && family !== null && person.birthDate !== null) {
    parts.push(`nd:${first}|${family}|${person.birthDate}`);
  }
  return parts;
}

async function fingerprint(plain: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const encoder = new TextEncoder();
    const material = await subtle.importKey("raw", encoder.encode(plain), "PBKDF2", false, ["deriveBits"]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(FINGERPRINT_SALT), iterations: FINGERPRINT_ITERATIONS },
      material,
      FINGERPRINT_BITS,
    );
    return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * Fills each person's fingerprints. They are a one-way pseudonym for recognising the same person's
 * next report, not anonymisation: an ID number has few possible values. Where the browser has no
 * Web Crypto the keys stay empty and the app falls back to the age and gender checks.
 */
export async function fingerprintPeople(people: ReportPerson[]): Promise<ReportPerson[]> {
  return Promise.all(
    people.map(async (person) => {
      const keys = (await Promise.all(identityParts(person).map(fingerprint))).filter(
        (key): key is string => key !== null,
      );
      return { ...person, keys };
    }),
  );
}
