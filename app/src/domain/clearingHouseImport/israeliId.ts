/** True for a nine-digit string that passes the Israeli ID check digit. */
export function isValidIsraeliId(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index++) {
    const product = Number(value[index]) * (index % 2 === 0 ? 1 : 2);
    sum += product > 9 ? product - 9 : product;
  }
  return sum % 10 === 0;
}

/** Compares two ID-like strings ignoring leading zeros and formatting. */
export function sameIdNumber(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/\D/g, "").replace(/^0+/, "");
  const left = normalize(a);
  return left !== "" && left === normalize(b);
}
