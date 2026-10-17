import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, Outlet } from "react-router-dom";

import { Stepper } from "../../components/Stepper";
import { STEP_ORDER, type StepKey } from "./stepOrder";

export function MyDataLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const currentKey: StepKey =
    STEP_ORDER.find((step) => location.pathname.endsWith(step)) ?? "personal";

  const steps = STEP_ORDER.map((key) => ({
    key,
    label: t(
      `myData.steps.${key === "pension-savings" ? "pensionSavings" : key}.label`,
    ),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900">
        {t("myData.title")}
      </h1>
      <Stepper
        steps={steps}
        currentKey={currentKey}
        onStepClick={(key) => navigate(`/my-data/${key}`)}
      />
      <Outlet />
    </div>
  );
}
