import { useTranslation } from "react-i18next";

/** An age such as 59.5 as "59 years 6 months", or just "60" when it is a whole number of years. */
export function useFormatAge(): (age: number) => string {
  const { t } = useTranslation();
  return (age) => {
    const years = Math.floor(age + 1e-9);
    const months = Math.round((age - years) * 12);
    return months === 0
      ? t("dashboard.sourceAccess.ageYears", { years })
      : t("dashboard.sourceAccess.ageYearsMonths", { years, months });
  };
}
