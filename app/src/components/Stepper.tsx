import clsx from "clsx";

interface StepperProps {
  steps: { key: string; label: string }[];
  currentKey: string;
  onStepClick?: (key: string) => void;
}

export function Stepper({ steps, currentKey, onStepClick }: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentKey);

  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
      {steps.map((step, index) => {
        const isActive = step.key === currentKey;
        const isComplete = index < currentIndex;
        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onStepClick?.(step.key)}
            className={clsx(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-teal-600 text-white"
                : isComplete
                  ? "bg-teal-50 text-teal-700"
                  : "bg-slate-100 text-slate-500",
            )}
          >
            <span
              className={clsx(
                "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                isActive
                  ? "bg-white/20"
                  : isComplete
                    ? "bg-teal-600 text-white"
                    : "bg-slate-300 text-slate-600",
              )}
            >
              {isComplete ? "✓" : index + 1}
            </span>
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
