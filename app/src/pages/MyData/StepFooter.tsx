import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useProfile } from "../../app/ProfileContext";
import { SaveStatus } from "../../components/SaveStatus";
import { nextStep, prevStep, type StepKey } from "./stepOrder";

interface StepFooterProps {
  currentKey: StepKey;
  /** When false, clicking Next/Save is blocked and `onInvalidAttempt` fires instead of navigating. */
  isValid?: boolean;
  onInvalidAttempt?: () => void;
}

export function StepFooter({ currentKey, isValid = true, onInvalidAttempt }: StepFooterProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeOnboarding } = useProfile();
  const next = nextStep(currentKey);
  const prev = prevStep(currentKey);

  const handleNext = () => {
    if (!isValid) {
      onInvalidAttempt?.();
      return;
    }
    if (next) {
      navigate(`/my-data/${next}`);
    } else {
      completeOnboarding();
      navigate("/dashboard");
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-3">
      <SaveStatus />
      <div className="flex justify-between">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && navigate(`/my-data/${prev}`)}
          className="btn btn-ghost text-slate-700 hover:bg-slate-100 disabled:invisible"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="btn btn-primary"
        >
          {next ? t("common.next") : t("common.viewResults")}
        </button>
      </div>
    </div>
  );
}
