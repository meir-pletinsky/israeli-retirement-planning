import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  clearAllData,
  loadOnboardedFromDb,
  loadProfileFromDb,
  migrateLegacyLocalStorageIfNeeded,
  saveOnboardedToDb,
  saveProfileToDb,
} from "../storage/db";
import { EMPTY_PROFILE, normalizeProfile, type ProfileData } from "../types";

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

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [onboarded, setOnboarded] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const hasLoadedRef = useRef(false);

  // Load persisted state from IndexedDB (via Dexie) once on mount. Routing
  // decisions (e.g. onboarded -> /dashboard) must not run against stale
  // defaults, so rendering of `children` is withheld until this resolves
  // (see the isReady guard below).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await migrateLegacyLocalStorageIfNeeded();
      const [storedProfile, storedOnboarded] = await Promise.all([
        loadProfileFromDb(),
        loadOnboardedFromDb(),
      ]);
      if (cancelled) return;
      if (storedProfile) setProfile(normalizeProfile(storedProfile));
      setOnboarded(storedOnboarded);
      hasLoadedRef.current = true;
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void saveProfileToDb(profile);
  }, [profile]);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void saveOnboardedToDb(onboarded);
  }, [onboarded]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      updateProfile: (patch) =>
        setProfile((prev) => ({ ...prev, ...patch })),
      onboarded,
      completeOnboarding: () => setOnboarded(true),
      resetProfile: () => {
        void clearAllData();
        setProfile(EMPTY_PROFILE);
        setOnboarded(false);
      },
    }),
    [profile, onboarded],
  );

  if (!isReady) return null;

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
