import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import { nextStep, prevStep, type StepKey } from "./stepOrder";

interface StepFooterProps {
  currentKey: StepKey;
}

export function StepFooter({ currentKey }: StepFooterProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeOnboarding } = useProfile();
  const next = nextStep(currentKey);
  const prev = prevStep(currentKey);

  return (
    <div className="mt-2 flex justify-between">
      <button
        type="button"
        disabled={!prev}
        onClick={() => prev && navigate(`/my-data/${prev}`)}
        className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:invisible"
      >
        {t("common.back")}
      </button>
      <button
        type="button"
        onClick={() => {
          if (next) {
            navigate(`/my-data/${next}`);
          } else {
            completeOnboarding();
            navigate("/dashboard");
          }
        }}
        className="rounded-md bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700"
      >
        {next ? t("common.next") : t("common.save")}
      </button>
    </div>
  );
}
