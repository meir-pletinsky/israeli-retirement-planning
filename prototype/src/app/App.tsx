import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";

import { isRtl } from "../i18n";
import { AssumptionsStep } from "../pages/MyData/AssumptionsStep";
import { EquityStep } from "../pages/MyData/EquityStep";
import { ExpensesStep } from "../pages/MyData/ExpensesStep";
import { MyDataLayout } from "../pages/MyData/MyDataLayout";
import { PensionSavingsStep } from "../pages/MyData/PensionSavingsStep";
import { PersonalStep } from "../pages/MyData/PersonalStep";
import { Dashboard } from "../pages/Dashboard";
import { Projections } from "../pages/Projections";
import { Settings } from "../pages/Settings";
import { Welcome } from "../pages/Welcome";
import { AppShell } from "./AppShell";
import { useProfile } from "./ProfileContext";

export function App() {
  const { i18n } = useTranslation();
  const { onboarded } = useProfile();

  useEffect(() => {
    document.documentElement.dir = isRtl(i18n.language) ? "rtl" : "ltr";
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          onboarded ? <Navigate to="/dashboard" replace /> : <Welcome />
        }
      />
      <Route element={<AppShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-data" element={<MyDataLayout />}>
          <Route index element={<Navigate to="personal" replace />} />
          <Route path="personal" element={<PersonalStep />} />
          <Route path="pension-savings" element={<PensionSavingsStep />} />
          <Route path="equity" element={<EquityStep />} />
          <Route path="expenses" element={<ExpensesStep />} />
          <Route path="assumptions" element={<AssumptionsStep />} />
        </Route>
        <Route path="/projections" element={<Projections />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
