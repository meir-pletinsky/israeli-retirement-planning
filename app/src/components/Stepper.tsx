import clsx from "clsx";

export interface StepperStep {
  key: string;
  label: string;
  /** Checked only when the step really has what it needs; never because the user moved past it. */
  done?: boolean;
  /** Short state shown under the label and read out with it. */
  status?: string;
  /** Draws attention to a step that blocks the plan. */
  needsAttention?: boolean;
}

interface StepperProps {
  steps: StepperStep[];
  currentKey: string;
  onStepClick?: (key: string) => void;
}

export function Stepper({ steps, currentKey, onStepClick }: StepperProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {steps.map((step, index) => {
        const isActive = step.key === currentKey;
        const isDone = step.done === true;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onStepClick?.(step.key)}
            aria-current={isActive ? "step" : undefined}
            className={clsx(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-start text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-600 text-white"
                : isDone
                  ? "bg-brand-50 text-brand-700"
                  : step.needsAttention
                    ? "bg-amber-50 text-amber-800"
                    : "bg-slate-100 text-slate-500",
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                isActive
                  ? "bg-white/20"
                  : isDone
                    ? "bg-brand-600 text-white"
                    : step.needsAttention
                      ? "bg-amber-200 text-amber-900"
                      : "bg-slate-300 text-slate-600",
              )}
            >
              {isDone ? "✓" : step.needsAttention ? "!" : index + 1}
            </span>
            <span className="flex flex-col leading-tight">
              <span>{step.label}</span>
              {step.status && (
                <>
                  {" "}
                  <span
                    className={clsx(
                      "text-xs font-normal",
                      isActive ? "text-white/80" : "opacity-80",
                    )}
                  >
                    {step.status}
                  </span>
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
