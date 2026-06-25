import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, authFetchHeaders, queryClient } from "@/lib/query-client";

export type TimeFormat = "12h" | "24h";
export type SpeedUnit = "kmh" | "mph" | "knots";
export type DistanceUnit = "km_m" | "mi_ft" | "mi_yd" | "nmi_ftm";

export interface UnitsPreferences {
  timeFormat: TimeFormat;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
}

interface UnitsContextType extends UnitsPreferences {
  setTimeFormat: (v: TimeFormat) => void;
  setSpeedUnit: (v: SpeedUnit) => void;
  setDistanceUnit: (v: DistanceUnit) => void;
  setSystem: (system: "metric" | "imperial") => void;
  applyCountryDefault: (country: string) => void;
}

interface GetMeResponse {
  profile?: {
    unitsPreference?: {
      timeFormat?: string;
      speedUnit?: string;
      distanceUnit?: string;
    } | null;
  } | null;
}

interface QueryCacheEvent {
  type: string;
  query: {
    queryKey: unknown[];
    state: { data: unknown };
  };
}

const DEFAULT_PREFS: UnitsPreferences = {
  timeFormat: "24h",
  speedUnit: "kmh",
  distanceUnit: "km_m",
};

const STORAGE_KEY = "@bikerlink/units_preferences";

const VALID_TIME_FORMATS: TimeFormat[] = ["12h", "24h"];
const VALID_SPEED_UNITS: SpeedUnit[] = ["kmh", "mph", "knots"];
const VALID_DISTANCE_UNITS: DistanceUnit[] = ["km_m", "mi_ft", "mi_yd", "nmi_ftm"];

const IMPERIAL_COUNTRY_ALIASES: Record<string, string> = { USA: "US", UK: "GB" };
const IMPERIAL_COUNTRIES = new Set(["US", "GB"]);

function normalizeCountryCode(country: string): string {
  const upper = country.toUpperCase();
  return IMPERIAL_COUNTRY_ALIASES[upper] ?? upper;
}

function isValidTimeFormat(v: unknown): v is TimeFormat {
  return VALID_TIME_FORMATS.includes(v as TimeFormat);
}
function isValidSpeedUnit(v: unknown): v is SpeedUnit {
  return VALID_SPEED_UNITS.includes(v as SpeedUnit);
}
function isValidDistanceUnit(v: unknown): v is DistanceUnit {
  return VALID_DISTANCE_UNITS.includes(v as DistanceUnit);
}

function syncPrefsToServer(prefs: UnitsPreferences): void {
  try {
    const url = new URL("/api/users/me", getApiUrl());
    fetch(url.toString(), {
      method: "PUT",
      credentials: "include",
      headers: authFetchHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ unitsPreference: prefs }),
    }).catch((err) => {
      if (__DEV__) console.warn("[units-context] syncPrefsToServer failed:", err);
    });
  } catch (err) {
    if (__DEV__) console.warn("[units-context] syncPrefsToServer setup error:", err);
  }
}

const UnitsContext = createContext<UnitsContextType>({
  ...DEFAULT_PREFS,
  setTimeFormat: () => {},
  setSpeedUnit: () => {},
  setDistanceUnit: () => {},
  setSystem: () => {},
  applyCountryDefault: () => {},
});

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(DEFAULT_PREFS.timeFormat);
  const [speedUnit, setSpeedUnitState] = useState<SpeedUnit>(DEFAULT_PREFS.speedUnit);
  const [distanceUnit, setDistanceUnitState] = useState<DistanceUnit>(DEFAULT_PREFS.distanceUnit);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [hasStoredPreference, setHasStoredPreference] = useState(false);

  const prefsRef = useRef<UnitsPreferences>(DEFAULT_PREFS);
  prefsRef.current = { timeFormat, speedUnit, distanceUnit };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<UnitsPreferences>;
            if (isValidTimeFormat(parsed.timeFormat)) setTimeFormatState(parsed.timeFormat);
            if (isValidSpeedUnit(parsed.speedUnit)) setSpeedUnitState(parsed.speedUnit);
            if (isValidDistanceUnit(parsed.distanceUnit)) setDistanceUnitState(parsed.distanceUnit);
            setHasStoredPreference(true);
          } catch (err) {
            if (__DEV__) console.warn("[units-context] AsyncStorage parse error:", err);
          }
        }
        setStorageLoaded(true);
      })
      .catch((err) => {
        if (__DEV__) console.warn("[units-context] AsyncStorage read error:", err);
        setStorageLoaded(true);
      });
  }, []);

  // Server hydration: loads prefs from DB when AsyncStorage is empty.
  // Subscribes to the React Query cache for /api/auth/me so that hydration is
  // retried when the user logs in — handles the case where the app starts before
  // authentication (first fetch returns 401), then the user logs in and
  // queryClient.setQueryData(["/api/auth/me"], ...) fires in auth-context.
  useEffect(() => {
    if (!storageLoaded || hasStoredPreference) return;

    let cancelled = false;
    let fetching = false;

    const applyServerPrefs = (data: GetMeResponse | null) => {
      if (cancelled || !data) return;
      const up = data.profile?.unitsPreference;
      if (!up) return;
      let applied = false;
      if (isValidTimeFormat(up.timeFormat)) { setTimeFormatState(up.timeFormat); applied = true; }
      if (isValidSpeedUnit(up.speedUnit)) { setSpeedUnitState(up.speedUnit); applied = true; }
      if (isValidDistanceUnit(up.distanceUnit)) { setDistanceUnitState(up.distanceUnit); applied = true; }
      if (applied) {
        const synced: UnitsPreferences = {
          timeFormat: isValidTimeFormat(up.timeFormat) ? up.timeFormat : DEFAULT_PREFS.timeFormat,
          speedUnit: isValidSpeedUnit(up.speedUnit) ? up.speedUnit : DEFAULT_PREFS.speedUnit,
          distanceUnit: isValidDistanceUnit(up.distanceUnit) ? up.distanceUnit : DEFAULT_PREFS.distanceUnit,
        };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(synced)).catch((err) => {
          if (__DEV__) console.warn("[units-context] AsyncStorage write after hydration failed:", err);
        });
        setHasStoredPreference(true);
      }
    };

    const tryFetch = () => {
      if (fetching || cancelled) return;
      fetching = true;
      const url = new URL("/api/users/me", getApiUrl());
      fetch(url.toString(), {
        credentials: "include",
        headers: authFetchHeaders(),
      })
        .then((r) => (r.ok ? (r.json() as Promise<GetMeResponse>) : Promise.resolve(null)))
        .then((data) => {
          fetching = false;
          applyServerPrefs(data);
        })
        .catch((err) => {
          fetching = false;
          if (__DEV__) console.warn("[units-context] server hydration fetch failed:", err);
        });
    };

    // Attempt immediately (handles already-authenticated case)
    tryFetch();

    // Also retry when /api/auth/me data becomes available in the query cache.
    // This handles the login-after-mount case: auth-context calls
    // queryClient.setQueryData(["/api/auth/me"], user) on login success, which
    // triggers this subscription and retries the fetch with the new session token.
    const unsub = queryClient.getQueryCache().subscribe((event: QueryCacheEvent) => {
      if (
        event.type === "updated" &&
        Array.isArray(event.query.queryKey) &&
        event.query.queryKey[0] === "/api/auth/me" &&
        event.query.state.data != null
      ) {
        tryFetch();
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [storageLoaded, hasStoredPreference]);

  const setTimeFormat = useCallback((v: TimeFormat) => {
    setTimeFormatState(v);
    const next: UnitsPreferences = { ...prefsRef.current, timeFormat: v };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) => {
      if (__DEV__) console.warn("[units-context] AsyncStorage write failed:", err);
    });
    syncPrefsToServer(next);
  }, []);

  const setSpeedUnit = useCallback((v: SpeedUnit) => {
    setSpeedUnitState(v);
    const next: UnitsPreferences = { ...prefsRef.current, speedUnit: v };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) => {
      if (__DEV__) console.warn("[units-context] AsyncStorage write failed:", err);
    });
    syncPrefsToServer(next);
  }, []);

  const setDistanceUnit = useCallback((v: DistanceUnit) => {
    setDistanceUnitState(v);
    const next: UnitsPreferences = { ...prefsRef.current, distanceUnit: v };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) => {
      if (__DEV__) console.warn("[units-context] AsyncStorage write failed:", err);
    });
    syncPrefsToServer(next);
  }, []);

  const setSystem = useCallback((system: "metric" | "imperial") => {
    const next: UnitsPreferences = system === "imperial"
      ? { timeFormat: "12h", speedUnit: "mph", distanceUnit: "mi_ft" }
      : { timeFormat: "24h", speedUnit: "kmh", distanceUnit: "km_m" };
    setTimeFormatState(next.timeFormat);
    setSpeedUnitState(next.speedUnit);
    setDistanceUnitState(next.distanceUnit);
    setHasStoredPreference(true);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((err) => {
      if (__DEV__) console.warn("[units-context] AsyncStorage write failed:", err);
    });
    syncPrefsToServer(next);
  }, []);

  const applyCountryDefault = useCallback((country: string) => {
    if (!storageLoaded || hasStoredPreference) return;
    if (IMPERIAL_COUNTRIES.has(normalizeCountryCode(country))) {
      const imperial: UnitsPreferences = { timeFormat: "12h", speedUnit: "mph", distanceUnit: "mi_ft" };
      setTimeFormatState("12h");
      setSpeedUnitState("mph");
      setDistanceUnitState("mi_ft");
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(imperial)).catch((err) => {
        if (__DEV__) console.warn("[units-context] AsyncStorage write failed:", err);
      });
      setHasStoredPreference(true);
    } else {
      const metric: UnitsPreferences = { timeFormat: "24h", speedUnit: "kmh", distanceUnit: "km_m" };
      setTimeFormatState("24h");
      setSpeedUnitState("kmh");
      setDistanceUnitState("km_m");
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(metric)).catch((err) => {
        if (__DEV__) console.warn("[units-context] AsyncStorage write failed:", err);
      });
      setHasStoredPreference(true);
    }
  }, [storageLoaded, hasStoredPreference]);

  const contextValue = useMemo(
    () => ({ timeFormat, speedUnit, distanceUnit, setTimeFormat, setSpeedUnit, setDistanceUnit, setSystem, applyCountryDefault }),
    [timeFormat, speedUnit, distanceUnit, setTimeFormat, setSpeedUnit, setDistanceUnit, setSystem, applyCountryDefault]
  );

  return (
    <UnitsContext.Provider value={contextValue}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits(): UnitsContextType {
  return useContext(UnitsContext);
}
