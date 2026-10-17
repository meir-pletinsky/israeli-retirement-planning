import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { EMPTY_PROFILE, type ProfileData } from "../types";

const STORAGE_KEY = "irp_profile";
const ONBOARDED_KEY = "irp_onboarded";

interface ProfileContextValue {
  profile: ProfileData;
  updateProfile: (patch: Partial<ProfileData>) => void;
  onboarded: boolean;
  completeOnboarding: () => void;
  resetProfile: () => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(
  undefined,
);

function loadProfile(): ProfileData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROFILE;
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as ProfileData) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const [onboarded, setOnboarded] = useState<boolean>(
    () => localStorage.getItem(ONBOARDED_KEY) === "true",
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      updateProfile: (patch) =>
        setProfile((prev) => ({ ...prev, ...patch })),
      onboarded,
      completeOnboarding: () => {
        localStorage.setItem(ONBOARDED_KEY, "true");
        setOnboarded(true);
      },
      resetProfile: () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ONBOARDED_KEY);
        setProfile(EMPTY_PROFILE);
        setOnboarded(false);
      },
    }),
    [profile, onboarded],
  );

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
