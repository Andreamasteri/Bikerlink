/**
 * Task #2531 — hook generico per salvare i filtri admin in AsyncStorage
 * (web → localStorage). Riusato dalle viste report (per categoria / ruolo /
 * pattern / ban) per ricordare l'ultimo filtro usato dal moderatore.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "bl.admin.filter.";

export function useAdminFilterPersist<T>(scope: string, initial: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const key = useRef(PREFIX + scope);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key.current)
      .then((raw) => {
        if (cancelled || !raw) return;
        try { setValue(JSON.parse(raw) as T); } catch { /* keep default */ }
      })
      .catch(() => { /* keep default */ })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      AsyncStorage.setItem(key.current, JSON.stringify(v)).catch(() => {});
      return v;
    });
  }, []);

  return [value, update, hydrated];
}
