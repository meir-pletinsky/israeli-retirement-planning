import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, Outlet } from "react-router-dom";

import { Stepper } from "../../components/Stepper";
import { ActivePersonProvider } from "./ActivePersonProvider";
import { FieldLegend } from "./FieldLegend";
import { STEP_ORDER, type StepKey } from "./stepOrder";

function toCamelCase(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function MyDataLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const currentKey: StepKey =
    STEP_ORDER.find((step) => location.pathname.endsWith(step)) ?? "personal";

  const steps = STEP_ORDER.map((key) => ({
    key,
    label: t(`myData.steps.${toCamelCase(key)}.label`),
  }));

  return (
    <ActivePersonProvider>
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-slate-900">
          {t("myData.title")}
        </h1>
        <Stepper
          steps={steps}
          currentKey={currentKey}
          onStepClick={(key) => navigate(`/my-data/${key}`)}
        />
        {/* The pension and equity steps show the legend inside their account and holding forms. */}
        {currentKey !== "pension-savings" && currentKey !== "equity" && <FieldLegend />}
        <Outlet />
      </div>
    </ActivePersonProvider>
  );
}
