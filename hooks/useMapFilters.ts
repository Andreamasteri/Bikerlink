import { useState, useCallback, useRef, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "@/lib/query-client";

type MapFiltersPrefs = {
  biker?: boolean;
  zavorrina?: boolean;
  clubs?: boolean;
  events?: boolean;
  // Task #2721 — id dei tag della moto selezionati come filtro mappa.
  motoTags?: string[];
};

interface MapFiltersUser {
  id?: string | number | null;
  mapFilters?: MapFiltersPrefs | null;
}

type UseMapFiltersProps = {
  user: MapFiltersUser | null | undefined;
  isAuthenticated: boolean;
};

export function useMapFilters({ user, isAuthenticated }: UseMapFiltersProps) {
  const [filterBiker, setFilterBiker] = useState(true);
  const [filterZavorrina, setFilterZavorrina] = useState(true);
  const [filterClubs, setFilterClubs] = useState(false);
  const [filterEvents, setFilterEvents] = useState(true);
  const [motoTags, setMotoTags] = useState<string[]>([]);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  const serverFiltersAppliedRef = useRef(false);
  const lastAppliedUserIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    const currentId = user?.id ?? null;
    if (lastAppliedUserIdRef.current !== currentId) {
      lastAppliedUserIdRef.current = currentId;
      serverFiltersAppliedRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("map_filters");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed.biker === "boolean") setFilterBiker(parsed.biker);
          if (typeof parsed.zavorrina === "boolean") setFilterZavorrina(parsed.zavorrina);
          if (typeof parsed.clubs === "boolean") setFilterClubs(parsed.clubs);
          if (typeof parsed.events === "boolean") setFilterEvents(parsed.events);
          if (Array.isArray(parsed.motoTags)) {
            setMotoTags(parsed.motoTags.filter((t: unknown): t is string => typeof t === "string"));
          }
        }
      } catch {
        // no-op: ignore storage read or JSON parsing failures
      }
      setFiltersLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!filtersLoaded) return;
    if (serverFiltersAppliedRef.current) return;
    if (!user) return;
    if (!("mapFilters" in user)) return;
    serverFiltersAppliedRef.current = true;
    const serverFilters = user.mapFilters as MapFiltersPrefs | null;
    if (serverFilters && typeof serverFilters === "object") {
      const nextBiker = typeof serverFilters.biker === "boolean" ? serverFilters.biker : filterBiker;
      const nextZav = typeof serverFilters.zavorrina === "boolean" ? serverFilters.zavorrina : filterZavorrina;
      const nextClubs = typeof serverFilters.clubs === "boolean" ? serverFilters.clubs : filterClubs;
      const nextEvents = typeof serverFilters.events === "boolean" ? serverFilters.events : filterEvents;
      const nextMotoTags = Array.isArray(serverFilters.motoTags)
        ? serverFilters.motoTags.filter((t): t is string => typeof t === "string")
        : motoTags;
      setFilterBiker(nextBiker);
      setFilterZavorrina(nextZav);
      setFilterClubs(nextClubs);
      setFilterEvents(nextEvents);
      setMotoTags(nextMotoTags);
      AsyncStorage.setItem(
        "map_filters",
        JSON.stringify({ biker: nextBiker, zavorrina: nextZav, clubs: nextClubs, events: nextEvents, motoTags: nextMotoTags })
      ).catch(() => {
        // no-op: ignore storage write failures
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersLoaded, user]);

  const persistMapFilters = useCallback(
    (payload: { biker: boolean; zavorrina: boolean; clubs: boolean; events: boolean; motoTags: string[] }) => {
      AsyncStorage.setItem("map_filters", JSON.stringify(payload)).catch(() => {
        // no-op: ignore storage write failures
      });
      serverFiltersAppliedRef.current = true;
      if (!isAuthenticated) return;
      apiRequest("PUT", "/api/users/me", { mapFilters: payload }).catch(() => {
        // no-op: ignore server update failures for map filters
      });
    },
    [isAuthenticated]
  );

  const toggleFilterBiker = useCallback(() => {
    setFilterBiker((prev) => {
      const next = !prev;
      persistMapFilters({ biker: next, zavorrina: filterZavorrina, clubs: filterClubs, events: filterEvents, motoTags });
      return next;
    });
  }, [persistMapFilters, filterZavorrina, filterClubs, filterEvents, motoTags]);

  const toggleFilterZavorrina = useCallback(() => {
    setFilterZavorrina((prev) => {
      const next = !prev;
      persistMapFilters({ biker: filterBiker, zavorrina: next, clubs: filterClubs, events: filterEvents, motoTags });
      return next;
    });
  }, [persistMapFilters, filterBiker, filterClubs, filterEvents, motoTags]);

  const toggleFilterClubs = useCallback(() => {
    setFilterClubs((prev) => {
      const next = !prev;
      persistMapFilters({ biker: filterBiker, zavorrina: filterZavorrina, clubs: next, events: filterEvents, motoTags });
      return next;
    });
  }, [persistMapFilters, filterBiker, filterZavorrina, filterEvents, motoTags]);

  const toggleFilterEvents = useCallback(() => {
    setFilterEvents((prev) => {
      const next = !prev;
      persistMapFilters({ biker: filterBiker, zavorrina: filterZavorrina, clubs: filterClubs, events: next, motoTags });
      return next;
    });
  }, [persistMapFilters, filterBiker, filterZavorrina, filterClubs, motoTags]);

  const setMotoTagsAndPersist = useCallback((next: string[]) => {
    setMotoTags(next);
    persistMapFilters({
      biker: filterBiker, zavorrina: filterZavorrina, clubs: filterClubs, events: filterEvents,
      motoTags: next,
    });
  }, [persistMapFilters, filterBiker, filterZavorrina, filterClubs, filterEvents]);

  return {
    filterBiker,
    filterZavorrina,
    filterClubs,
    filterEvents,
    motoTags,
    filtersLoaded,
    toggleFilterBiker,
    toggleFilterZavorrina,
    toggleFilterClubs,
    toggleFilterEvents,
    setMotoTags: setMotoTagsAndPersist,
  };
}
