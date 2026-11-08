import clsx from "clsx";
import { useEffect, useRef } from "react";

import { useMediaQuery } from "../app/useMediaQuery";

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
  const currentStep = useRef<HTMLButtonElement>(null);
  const phone = useMediaQuery("(width < 40rem)");

  useEffect(() => {
    if (phone) currentStep.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [currentKey, phone]);

  return (
    <div className="-mx-4 overflow-x-auto px-4 py-1 md:mx-0 md:px-0">
      <ol className="flex min-w-max items-stretch rounded-[var(--radius-card)] border border-slate-200 bg-white p-1.5 shadow-sm md:min-w-0">
        {steps.map((step, index) => {
          const isActive = step.key === currentKey;
          const isDone = step.done === true;
          return (
            <li key={step.key} className="flex flex-1 items-center">
              <button
                ref={isActive ? currentStep : undefined}
                type="button"
                onClick={() => onStepClick?.(step.key)}
                aria-current={isActive ? "step" : undefined}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors",
                  isActive ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isDone
                      ? "bg-brand-600 text-white"
                      : step.needsAttention
                        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-700"
                        : isActive
                          ? "bg-white text-brand-800 ring-2 ring-brand-600"
                          : "bg-slate-100 text-slate-600",
                  )}
                >
                  {isDone ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  ) : step.needsAttention ? "!" : index + 1}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className={clsx("whitespace-nowrap text-sm md:whitespace-normal", isActive ? "font-semibold text-brand-900" : "font-medium text-slate-800")}>{step.label}</span>
                  {" "}
                  {step.status && (
                    <span className={clsx("mt-0.5 whitespace-nowrap text-xs md:whitespace-normal", step.needsAttention ? "text-amber-800" : "text-slate-500")}>{step.status}</span>
                  )}
                </span>
              </button>
              {index < steps.length - 1 && <span aria-hidden="true" className="mx-1 hidden h-px w-4 shrink-0 bg-slate-200 lg:block" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
