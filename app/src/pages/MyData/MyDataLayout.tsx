import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, Outlet } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import { Stepper } from "../../components/Stepper";
import { ActivePersonProvider } from "./ActivePersonProvider";
import { FieldLegend } from "./FieldLegend";
import { STEP_ORDER, type StepKey } from "./stepOrder";
import { isStepDone, stepStatus } from "./stepStatus";

/**
 * The pension and equity steps show the legend inside their account and holding forms. Expenses
 * has at most one tagged field, whose helper text already explains it, and Assumptions has none.
 */
const STEPS_WITHOUT_LEGEND: readonly StepKey[] = [
  "pension-savings",
  "equity",
  "expenses",
  "assumptions",
];

function toCamelCase(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function MyDataLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useProfile();

  const currentKey: StepKey =
    STEP_ORDER.find((step) => location.pathname.endsWith(step)) ?? "personal";

  const steps = STEP_ORDER.map((key) => {
    const status = stepStatus(profile, key);
    return {
      key,
      label: t(`myData.steps.${toCamelCase(key)}.label`),
      status: t(`myData.stepStatus.${status}`),
      done: isStepDone(status),
      needsAttention: status === "requiredMissing",
    };
  });

  return (
    <ActivePersonProvider>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t("myData.title")}
        </h1>
        <Stepper
          steps={steps}
          currentKey={currentKey}
          onStepClick={(key) => navigate(`/my-data/${key}`)}
        />
        {STEPS_WITHOUT_LEGEND.includes(currentKey) ? (
          <Outlet />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,40rem)_minmax(16rem,20rem)] lg:gap-10">
            <div className="lg:sticky lg:top-8 lg:order-last"><FieldLegend /></div>
            <div className="card min-w-0"><Outlet /></div>
          </div>
        )}
      </div>
    </ActivePersonProvider>
  );
}
