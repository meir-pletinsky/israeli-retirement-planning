import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ImportanceBadge } from "../../components/fields/FieldLabel";
import { BoltIcon } from "./WelcomeCard";

type StepKey = "personal" | "pensionSavings" | "equity" | "expenses" | "assumptions";

interface FlowStep {
  key: StepKey;
  importance: "required" | "recommended" | "optional";
  /** The Clearing House import fills most of this step. */
  fastTrack: boolean;
}

/** The My Data steps in their order (see `pages/MyData/stepOrder.ts`). */
const FLOW_STEPS: readonly FlowStep[] = [
  { key: "personal", importance: "required", fastTrack: true },
  { key: "pensionSavings", importance: "recommended", fastTrack: true },
  { key: "equity", importance: "optional", fastTrack: false },
  { key: "expenses", importance: "recommended", fastTrack: false },
  { key: "assumptions", importance: "optional", fastTrack: false },
];

/** A line with an arrowhead that leads the eye from one step to the next. */
function Connector() {
  return (
    <span aria-hidden="true" className="flex flex-1 flex-col items-center text-brand-300">
      <span className="w-px flex-1 bg-brand-200" />
      <svg viewBox="0 0 12 8" width="12" height="8" className="-mt-px shrink-0" fill="currentColor">
        <path d="M0 0h12L6 8z" />
      </svg>
    </span>
  );
}

function Marker({ children, tone }: { children: ReactNode; tone: "step" | "goal" }) {
  return (
    <span
      aria-hidden="true"
      className={
        tone === "step"
          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
      }
    >
      {children}
    </span>
  );
}

function OptionalBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-block rounded-full bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold leading-none text-slate-500">
      {t("welcome.flow.optional")}
    </span>
  );
}

/** The suggested order of the My Data steps, drawn as a flow that ends at the results. */
export function GetStartedFlow({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <section
      id={id}
      aria-labelledby="welcome-flow-title"
      className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700 shadow-sm sm:p-6"
    >
      <h2 id="welcome-flow-title" tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none">
        {t("welcome.flow.title")}
      </h2>
      <p className="mt-1 max-w-2xl">{t("welcome.flow.intro")}</p>
      <ol className="mt-5 flex flex-col">
        {FLOW_STEPS.map((step, index) => (
          <li key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center gap-1">
              <Marker tone="step">{index + 1}</Marker>
              <Connector />
            </div>
            <div className="mb-3 flex-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-slate-900">{t(`myData.steps.${step.key}.label`)}</h3>
                {step.importance === "optional" ? (
                  <OptionalBadge />
                ) : (
                  <ImportanceBadge importance={step.importance} />
                )}
                {step.fastTrack && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold leading-none text-amber-800">
                    <span aria-hidden="true" className="[&>svg]:h-3 [&>svg]:w-3">
                      <BoltIcon />
                    </span>
                    {t("welcome.flow.fastTrackBadge")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-slate-600">{t(`welcome.flow.steps.${step.key}`)}</p>
            </div>
          </li>
        ))}
        <li className="flex gap-4">
          <Marker tone="goal">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10" />
            </svg>
          </Marker>
          <div className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <h3 className="font-semibold text-emerald-900">{t("welcome.flow.result.title")}</h3>
            <p className="mt-1 text-emerald-900/80">{t("welcome.flow.result.body")}</p>
          </div>
        </li>
      </ol>
      <button
        type="button"
        onClick={() => navigate("/my-data/personal")}
        className="mt-6 w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto sm:min-w-56"
      >
        {t("welcome.start")}
      </button>
    </section>
  );
}
