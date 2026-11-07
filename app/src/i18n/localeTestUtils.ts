// Plural forms differ per language: Hebrew and Russian have more of them than English, and a
// "one" form may leave out the count.
export const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

export const baseKey = (key: string) => key.replace(PLURAL_SUFFIX, "");

// A language may split a plain English text into plural forms so that a counted noun agrees with
// its number; the "other" form then stands in for the plain key.
export const localized = (strings: Record<string, string>, key: string) =>
  strings[key] ?? strings[`${key}_other`];

// The English plural keys (`_one` / `_other`) map to the same base key as the localized ones.
export const sameBaseKeys = (own: string[], english: string[]) => {
  const expected = new Set(english.map(baseKey));
  return own.filter((key) => !expected.has(baseKey(key)));
};
