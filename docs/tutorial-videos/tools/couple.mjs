// The fictional couple the tutorial videos follow. Every name, ID and amount is made up.
// Used by generate-demo-data.mjs (reports, CSV) and by the recorder (what to type).

export const COUPLE = {
  daniel: {
    he: { first: "דניאל", last: "בר-לב" },
    en: "Daniel",
    ru: "Даниэль",
    // Israeli ID without its check digit; the generator appends a valid one.
    idBase: "03418275",
    sex: 1, // Clearing House <MIN>: 1 male, 2 female
    birth: "19780314",
    salary: 32000,
    employer: 'אופק טכנולוגיות בע"מ',
    retirementAge: 65,
    creditPoints: 2.25,
  },
  noa: {
    he: { first: "נועה", last: "בר-לב" },
    en: "Noa",
    ru: "Ноа",
    idBase: "04126583",
    sex: 2,
    birth: "19810905",
    salary: 18500,
    employer: 'מרכז רפואי הדר בע"מ',
    retirementAge: 63,
    // 2.75 standard for a woman + one point for each of their two school-age children
    creditPoints: 4.75,
  },
  children: 2,
};

/** Israeli ID check digit: weights 1,2,1,2..., digits above 9 folded, total divisible by 10. */
export function withCheckDigit(base8) {
  const digits = base8.padStart(8, "0");
  for (let check = 0; check < 10; check++) {
    const id = `${digits}${check}`;
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let value = Number(id[i]) * (i % 2 === 0 ? 1 : 2);
      if (value > 9) value -= 9;
      sum += value;
    }
    if (sum % 10 === 0) return id;
  }
  throw new Error("unreachable");
}

// Stock lots, loaded through the "paste CSV" option on the Equity step.
export const STOCK_LOTS = [
  { date: "2023-03-15", symbol: "MSFT", quantity: 40 },
  { date: "2023-09-12", symbol: "AAPL", quantity: 60 },
  { date: "2024-02-06", symbol: "GOOGL", quantity: 50 },
  { date: "2024-08-20", symbol: "MSFT", quantity: 25 },
  { date: "2025-01-14", symbol: "AMZN", quantity: 45 },
  { date: "2025-06-03", symbol: "AAPL", quantity: 30 },
];

// Expenses picked from the suggestion list on the Expenses step: catalogue key and the amount of one payment.
export const EXPENSE_PICKS = [
  ["arnona", 1600],
  ["vaadBayit", 300],
  ["electricity", 650],
  ["groceries", 6500],
  ["fuel", 1600],
  ["vehicleInsurance", 5500],
  ["vehicleReplacement", 140000],
  ["privateHealthInsurance", 900],
  ["restaurants", 2200],
  ["overseasTrips", 48000],
  ["familySupport", 3000],
];

// One expense typed by hand; the name is a proper noun, so it is written per language.
export const MANUAL_EXPENSE = {
  name: { en: "Cleaning help", ru: "Помощь по хозяйству", he: "עזרה בניקיון" },
  amount: 2400,
};

// Savings on the Equity step ("Bank deposits").
export const BANK_DEPOSITS = [
  {
    bankName: "Bank Hapoalim",
    amount: 150000,
    startDate: "2026-03-01",
    maturityDate: "2027-03-01",
    annualInterestRatePercent: 4.2,
  },
  {
    bankName: "Bank Leumi",
    amount: 80000,
    startDate: "2025-11-15",
    maturityDate: "2028-11-15",
    annualInterestRatePercent: 3.9,
  },
];
