export type Gender = "male" | "female";

export type AssumptionPreset = "conservative" | "base" | "optimistic";

export interface Assumptions {
  preset: AssumptionPreset;
  investmentReturnPct: number;
  inflationPct: number;
}

export const ASSUMPTION_PRESETS: Record<
  AssumptionPreset,
  { investmentReturnPct: number; inflationPct: number }
> = {
  conservative: { investmentReturnPct: 4, inflationPct: 4 },
  base: { investmentReturnPct: 6, inflationPct: 2.5 },
  optimistic: { investmentReturnPct: 8, inflationPct: 1.5 },
};

export interface PersonalData {
  age: number | null;
  gender: Gender | null;
  retirementAge: number | null;
}

export interface PensionSavingsData {
  pensionBalance: number | null;
  hishtalmutBalance: number | null;
  otherInvestments: number | null;
}

export interface ExpensesData {
  currentMonthly: number | null;
  retirementMonthly: number | null;
}

export interface ProfileData {
  personal: PersonalData;
  pensionSavings: PensionSavingsData;
  expenses: ExpensesData;
  assumptions: Assumptions;
}

export const EMPTY_PROFILE: ProfileData = {
  personal: { age: null, gender: null, retirementAge: null },
  pensionSavings: {
    pensionBalance: null,
    hishtalmutBalance: null,
    otherInvestments: null,
  },
  expenses: { currentMonthly: null, retirementMonthly: null },
  assumptions: { preset: "base", ...ASSUMPTION_PRESETS.base },
};

export type RetirementScenario = "standard" | "early" | "delayed";
