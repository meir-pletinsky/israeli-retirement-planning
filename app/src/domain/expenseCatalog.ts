import {
  createEmptyExpenseItem,
  type ExpenseCategory,
  type ExpenseFrequency,
  type ExpenseItem,
  type ExpenseNecessity,
} from "../types";

/**
 * A built-in suggestion for the itemised retirement budget. It carries no amount: only what the
 * item is, how often it is usually paid and whether it belongs in a minimum budget. The user
 * changes any of it. The name is `myData.steps.expenses.catalog.<key>` in the language files.
 *
 * Source: a household-expense catalogue for an Israeli couple of about 50-65 living on their own.
 * Frequencies for big purchases (a car every 7 years, appliances every 10) are typical, not rules.
 */
export interface ExpenseSuggestion {
  key: string;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  /** Years between payments when `frequency` is `everyYears`. */
  everyYears?: number;
  necessity: ExpenseNecessity;
}

const monthly = (key: string, category: ExpenseCategory, necessity: ExpenseNecessity): ExpenseSuggestion => ({
  key,
  category,
  frequency: "monthly",
  necessity,
});
const every = (
  key: string,
  category: ExpenseCategory,
  frequency: Exclude<ExpenseFrequency, "everyYears">,
  necessity: ExpenseNecessity,
): ExpenseSuggestion => ({ key, category, frequency, necessity });
const everyYears = (
  key: string,
  category: ExpenseCategory,
  years: number,
  necessity: ExpenseNecessity,
): ExpenseSuggestion => ({ key, category, frequency: "everyYears", everyYears: years, necessity });

export const EXPENSE_SUGGESTIONS: readonly ExpenseSuggestion[] = [
  // Housing
  monthly("rentOrMortgage", "housing", "essential"),
  every("arnona", "housing", "bimonthly", "essential"),
  monthly("vaadBayit", "housing", "essential"),
  every("electricity", "housing", "bimonthly", "essential"),
  every("water", "housing", "bimonthly", "essential"),
  every("gas", "housing", "quarterly", "essential"),
  every("homeInsurance", "housing", "yearly", "essential"),
  every("homeRepairs", "housing", "yearly", "essential"),
  everyYears("appliances", "housing", 10, "essential"),
  everyYears("furniture", "housing", 10, "discretionary"),
  everyYears("homeImprovements", "housing", 7, "discretionary"),
  everyYears("buildingAssessment", "housing", 5, "essential"),
  // Food and household
  monthly("groceries", "food", "essential"),
  monthly("householdSupplies", "food", "essential"),
  monthly("personalCare", "food", "essential"),
  // Transportation
  monthly("fuel", "transport", "essential"),
  every("vehicleInsurance", "transport", "yearly", "essential"),
  every("vehicleMaintenance", "transport", "yearly", "essential"),
  every("vehicleLicence", "transport", "yearly", "essential"),
  monthly("parkingTolls", "transport", "discretionary"),
  monthly("publicTransportTaxis", "transport", "discretionary"),
  everyYears("majorVehicleRepairs", "transport", 3, "essential"),
  everyYears("vehicleReplacement", "transport", 7, "essential"),
  every("roadsideAssistance", "transport", "yearly", "discretionary"),
  // Healthcare
  monthly("kupatHolimSupplement", "health", "essential"),
  monthly("privateHealthInsurance", "health", "discretionary"),
  monthly("longTermCareInsurance", "health", "essential"),
  monthly("medications", "health", "essential"),
  monthly("regularTreatments", "health", "essential"),
  every("majorDental", "health", "yearly", "essential"),
  everyYears("glasses", "health", 2, "essential"),
  everyYears("hearingAids", "health", 5, "essential"),
  every("medicalProcedures", "health", "yearly", "essential"),
  everyYears("medicalEquipment", "health", 5, "essential"),
  // Communications
  monthly("mobile", "communication", "essential"),
  monthly("internet", "communication", "essential"),
  monthly("tvStreaming", "communication", "discretionary"),
  monthly("digitalSubscriptions", "communication", "discretionary"),
  // Personal and lifestyle
  monthly("restaurants", "lifestyle", "discretionary"),
  monthly("entertainment", "lifestyle", "discretionary"),
  monthly("sports", "lifestyle", "discretionary"),
  monthly("hobbies", "lifestyle", "discretionary"),
  monthly("clothing", "lifestyle", "discretionary"),
  monthly("haircuts", "lifestyle", "discretionary"),
  everyYears("electronics", "lifestyle", 4, "discretionary"),
  every("courses", "lifestyle", "yearly", "discretionary"),
  // Travel and leisure
  every("overseasTrips", "travel", "yearly", "discretionary"),
  every("domesticTrips", "travel", "yearly", "discretionary"),
  every("travelInsurance", "travel", "yearly", "discretionary"),
  // Family and social
  monthly("gifts", "family", "discretionary"),
  every("holidays", "family", "yearly", "discretionary"),
  everyYears("familyEvents", "family", 2, "discretionary"),
  monthly("familySupport", "family", "discretionary"),
  monthly("charity", "family", "discretionary"),
  // Financial and legal
  monthly("bankFees", "financial", "essential"),
  monthly("lifeInsurance", "financial", "discretionary"),
  every("accountant", "financial", "yearly", "essential"),
  every("legalFees", "financial", "yearly", "discretionary"),
  every("insuranceDeductibles", "financial", "yearly", "essential"),
  every("taxesNotWithheld", "financial", "yearly", "essential"),
  // Other
  monthly("pets", "other", "discretionary"),
  monthly("miscellaneous", "other", "discretionary"),
  every("contingency", "other", "yearly", "essential"),
];

/**
 * A new list item from a suggestion, with the amount if the user typed one. The name stays empty
 * so the screen shows the catalog name in whatever language is active; typing a name overrides it.
 */
export function itemFromSuggestion(suggestion: ExpenseSuggestion, amount: number | null): ExpenseItem {
  return {
    ...createEmptyExpenseItem(),
    catalogKey: suggestion.key,
    category: suggestion.category,
    amount,
    frequency: suggestion.frequency,
    everyYears: suggestion.everyYears ?? null,
    necessity: suggestion.necessity,
  };
}
