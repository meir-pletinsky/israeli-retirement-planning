import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  clearAllData,
  loadFxLookupEnabledFromDb,
  loadOnboardedFromDb,
  loadProfileFromDb,
  migrateLegacyLocalStorageIfNeeded,
  saveFxLookupEnabledToDb,
  saveOnboardedToDb,
  saveProfileToDb,
} from "../storage/db";
import {
  EMPTY_PROFILE,
  hasProfileData,
  normalizeProfile,
  type ProfileData,
} from "../types";

interface ProfileContextValue {
  profile: ProfileData;
  updateProfile: (patch: Partial<ProfileData>) => void;
  /**
   * True once the user finished the My Data steps or imported a file, and also whenever the saved
   * profile already holds data, so a returning visitor is not sent back to the welcome page.
   */
  onboarded: boolean;
  completeOnboarding: () => void;
  resetProfile: () => void;
  /** Whether the app may ask the Frankfurter service for exchange rates; a preference, not part of the profile. */
  fxLookupEnabled: boolean;
  setFxLookupEnabled: (enabled: boolean) => void;
  /**
   * Sets the dollar rate that values the equity holdings. A rate with a date is the Bank of
   * Israel's; without a date it is the user's own and no lookup replaces it. Null goes back to
   * the built-in fallback. Applies to the latest profile, so a lookup that finishes while the
   * user is typing cannot undo their edits.
   */
  setUsdToIlsRate: (rate: number | null, date: string | null) => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(
  undefined,
);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [onboarded, setOnboarded] = useState(false);
  const [fxLookupEnabled, setFxLookupEnabled] = useState(true);
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
      const [storedProfile, storedOnboarded, storedFxLookup] = await Promise.all([
        loadProfileFromDb(),
        loadOnboardedFromDb(),
        loadFxLookupEnabledFromDb(),
      ]);
      if (cancelled) return;
      if (storedProfile) setProfile(normalizeProfile(storedProfile));
      setOnboarded(storedOnboarded);
      setFxLookupEnabled(storedFxLookup);
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

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void saveFxLookupEnabledToDb(fxLookupEnabled);
  }, [fxLookupEnabled]);

  const hasData = useMemo(() => hasProfileData(profile), [profile]);

  const setUsdToIlsRate = useCallback(
    (usdToIlsRate: number | null, usdToIlsRateDate: string | null) =>
      setProfile((prev) =>
        prev.equity.usdToIlsRate === usdToIlsRate &&
        prev.equity.usdToIlsRateDate === usdToIlsRateDate
          ? prev
          : { ...prev, equity: { ...prev.equity, usdToIlsRate, usdToIlsRateDate } },
      ),
    [],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      updateProfile: (patch) =>
        setProfile((prev) => ({ ...prev, ...patch })),
      onboarded: onboarded || hasData,
      completeOnboarding: () => setOnboarded(true),
      resetProfile: () => {
        void clearAllData();
        setProfile(EMPTY_PROFILE);
        setOnboarded(false);
        setFxLookupEnabled(true);
      },
      fxLookupEnabled,
      setFxLookupEnabled,
      setUsdToIlsRate,
    }),
    [profile, onboarded, hasData, fxLookupEnabled, setUsdToIlsRate],
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
