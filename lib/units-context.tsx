import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

const DEFAULT_PREFS: UnitsPreferences = {
  timeFormat: "24h",
  speedUnit: "kmh",
  distanceUnit: "km_m",
};

const STORAGE_KEY = "@bikerlink/units_preferences";

const VALID_TIME_FORMATS: TimeFormat[] = ["12h", "24h"];
const VALID_SPEED_UNITS: SpeedUnit[] = ["kmh", "mph", "knots"];
const VALID_DISTANCE_UNITS: DistanceUnit[] = ["km_m", "mi_ft", "mi_yd", "nmi_ftm"];

const IMPERIAL_COUNTRIES = new Set(["US", "GB"]);

function isValidTimeFormat(v: unknown): v is TimeFormat {
  return VALID_TIME_FORMATS.includes(v as TimeFormat);
}
function isValidSpeedUnit(v: unknown): v is SpeedUnit {
  return VALID_SPEED_UNITS.includes(v as SpeedUnit);
}
function isValidDistanceUnit(v: unknown): v is DistanceUnit {
  return VALID_DISTANCE_UNITS.includes(v as DistanceUnit);
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
          } catch {}
        }
        setStorageLoaded(true);
      })
      .catch(() => { setStorageLoaded(true); });
  }, []);

  const setTimeFormat = useCallback((v: TimeFormat) => {
    setTimeFormatState(v);
    const next: UnitsPreferences = { ...prefsRef.current, timeFormat: v };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setSpeedUnit = useCallback((v: SpeedUnit) => {
    setSpeedUnitState(v);
    const next: UnitsPreferences = { ...prefsRef.current, speedUnit: v };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setDistanceUnit = useCallback((v: DistanceUnit) => {
    setDistanceUnitState(v);
    const next: UnitsPreferences = { ...prefsRef.current, distanceUnit: v };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Atomic setter: aggiorna tutti e 3 i valori + scrive AsyncStorage una sola volta
  const setSystem = useCallback((system: "metric" | "imperial") => {
    const next: UnitsPreferences = system === "imperial"
      ? { timeFormat: "12h", speedUnit: "mph", distanceUnit: "mi_ft" }
      : { timeFormat: "24h", speedUnit: "kmh", distanceUnit: "km_m" };
    setTimeFormatState(next.timeFormat);
    setSpeedUnitState(next.speedUnit);
    setDistanceUnitState(next.distanceUnit);
    setHasStoredPreference(true);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const applyCountryDefault = useCallback((country: string) => {
    if (!storageLoaded || hasStoredPreference) return;
    if (IMPERIAL_COUNTRIES.has(country)) {
      const imperial: UnitsPreferences = { timeFormat: "12h", speedUnit: "mph", distanceUnit: "mi_ft" };
      setTimeFormatState("12h");
      setSpeedUnitState("mph");
      setDistanceUnitState("mi_ft");
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(imperial)).catch(() => {});
      setHasStoredPreference(true);
    } else {
      const metric: UnitsPreferences = { timeFormat: "24h", speedUnit: "kmh", distanceUnit: "km_m" };
      setTimeFormatState("24h");
      setSpeedUnitState("kmh");
      setDistanceUnitState("km_m");
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(metric)).catch(() => {});
      setHasStoredPreference(true);
    }
  }, [storageLoaded, hasStoredPreference]);

  return (
    <UnitsContext.Provider value={{ timeFormat, speedUnit, distanceUnit, setTimeFormat, setSpeedUnit, setDistanceUnit, setSystem, applyCountryDefault }}>
      {children}
    </UnitsContext.Provider>
  );
}

export function useUnits(): UnitsContextType {
  return useContext(UnitsContext);
}
