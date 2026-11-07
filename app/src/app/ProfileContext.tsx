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

import { pinEngineClock, pinEngineClockToNow } from "../domain";
import {
  clearAllData,
  loadCpiLookupEnabledFromDb,
  loadFxLookupEnabledFromDb,
  loadOnboardedFromDb,
  loadProfileFromDb,
  migrateLegacyLocalStorageIfNeeded,
  saveCpiLookupEnabledToDb,
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

import { SaveStatusContext, type SaveStatus } from "./saveStatus";

interface ProfileContextValue {
  profile: ProfileData;
  /**
   * The moment every figure is calculated at: the engine's clock is pinned to it (see
   * `pinEngineClock`), so each screen shows the same numbers. It moves on when the profile changes.
   */
  evaluatedAt: Date;
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
  /** Whether the app may ask the Central Bureau of Statistics for the consumer price index; a preference, not part of the profile. */
  cpiLookupEnabled: boolean;
  setCpiLookupEnabled: (enabled: boolean) => void;
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

/** A tab that comes back to the foreground after this long gets a fresh calculation moment. */
const CLOCK_REFRESH_AFTER_MS = 60 * 60 * 1000;

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [onboarded, setOnboarded] = useState(false);
  const [fxLookupEnabled, setFxLookupEnabled] = useState(true);
  const [cpiLookupEnabled, setCpiLookupEnabled] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const saveCountRef = useRef(0);
  const hasLoadedRef = useRef(false);

  // Load persisted state from IndexedDB (via Dexie) once on mount. Routing
  // decisions (e.g. onboarded -> /dashboard) must not run against stale
  // defaults, so rendering of `children` is withheld until this resolves
  // (see the isReady guard below).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await migrateLegacyLocalStorageIfNeeded();
      const [storedProfile, storedOnboarded, storedFxLookup, storedCpiLookup] = await Promise.all([
        loadProfileFromDb(),
        loadOnboardedFromDb(),
        loadFxLookupEnabledFromDb(),
        loadCpiLookupEnabledFromDb(),
      ]);
      if (cancelled) return;
      if (storedProfile) setProfile(normalizeProfile(storedProfile));
      setOnboarded(storedOnboarded);
      setFxLookupEnabled(storedFxLookup);
      setCpiLookupEnabled(storedCpiLookup);
      hasLoadedRef.current = true;
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const saveNumber = ++saveCountRef.current;
    setSaveStatus("saving");
    // Only the newest write decides the status, so a slow earlier one cannot mask it.
    saveProfileToDb(profile).then(
      () => {
        if (saveNumber === saveCountRef.current) setSaveStatus("saved");
      },
      () => {
        if (saveNumber === saveCountRef.current) setSaveStatus("error");
      },
    );
  }, [profile]);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void saveOnboardedToDb(onboarded);
  }, [onboarded]);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void saveFxLookupEnabledToDb(fxLookupEnabled);
  }, [fxLookupEnabled]);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    void saveCpiLookupEnabledToDb(cpiLookupEnabled);
  }, [cpiLookupEnabled]);

  const hasData = useMemo(() => hasProfileData(profile), [profile]);

  // One moment for every calculation until the profile changes or the tab comes back after a
  // while, so the same figure on two screens is never computed at two different clock readings.
  const [clockRefresh, setClockRefresh] = useState(0);
  const evaluatedAt = useMemo(() => {
    void profile;
    void clockRefresh;
    return pinEngineClockToNow();
  }, [profile, clockRefresh]);
  useEffect(() => {
    pinEngineClock(evaluatedAt);
    return () => pinEngineClock(null);
  }, [evaluatedAt]);
  useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - evaluatedAt.getTime() > CLOCK_REFRESH_AFTER_MS
      ) {
        setClockRefresh((count) => count + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [evaluatedAt]);

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
      evaluatedAt,
      updateProfile: (patch) =>
        setProfile((prev) => ({ ...prev, ...patch })),
      onboarded: onboarded || hasData,
      completeOnboarding: () => setOnboarded(true),
      resetProfile: () => {
        void clearAllData();
        setProfile(EMPTY_PROFILE);
        setOnboarded(false);
        setFxLookupEnabled(true);
        setCpiLookupEnabled(true);
      },
      fxLookupEnabled,
      setFxLookupEnabled,
      cpiLookupEnabled,
      setCpiLookupEnabled,
      setUsdToIlsRate,
    }),
    [profile, evaluatedAt, onboarded, hasData, fxLookupEnabled, cpiLookupEnabled, setUsdToIlsRate],
  );

  if (!isReady) return null;

  return (
    <ProfileContext.Provider value={value}>
      <SaveStatusContext.Provider value={saveStatus}>{children}</SaveStatusContext.Provider>
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
