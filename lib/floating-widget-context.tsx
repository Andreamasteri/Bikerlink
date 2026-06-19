import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";

const STORAGE_KEY = "floating_widget_enabled";

interface FloatingWidgetContextValue {
  enabled: boolean;
  setEnabled: (val: boolean) => void;
  suppressed: boolean;
  suppressWidget: (val: boolean) => void;
  isUpdating: boolean;
}

const FloatingWidgetContext = createContext<FloatingWidgetContextValue>({
  enabled: true,
  setEnabled: () => {},
  suppressed: false,
  suppressWidget: () => {},
  isUpdating: false,
});

export function FloatingWidgetProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(true);
  const [suppressed, setSuppressed] = useState(false);
  const mountedRef = useRef(true);
  const serverHydratedRef = useRef(false);
  const enabledRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (mountedRef.current && val !== null) {
        const parsed = val === "true";
        setEnabledState(parsed);
        enabledRef.current = parsed;
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

  const profileQ = useQuery<{ floatingWidgetEnabled?: boolean }>({
    queryKey: ["/api/users/me"],
    staleTime: 60_000,
  });

  useEffect(() => {
    if (serverHydratedRef.current) return;
    if (!profileQ.data) return;
    const serverEnabled = profileQ.data.floatingWidgetEnabled;
    if (serverEnabled === undefined || serverEnabled === null) return;
    serverHydratedRef.current = true;
    setEnabledState(serverEnabled);
    enabledRef.current = serverEnabled;
    AsyncStorage.setItem(STORAGE_KEY, serverEnabled ? "true" : "false").catch(() => {});
  }, [profileQ.data]);

  const updateMutation = useMutation({
    mutationFn: async (val: boolean) => {
      const res = await apiRequest("PUT", "/api/users/me", { floatingWidgetEnabled: val });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const setEnabled = useCallback((val: boolean) => {
    const prev = enabledRef.current;
    setEnabledState(val);
    enabledRef.current = val;
    serverHydratedRef.current = true;
    AsyncStorage.setItem(STORAGE_KEY, val ? "true" : "false").catch(() => {});
    updateMutation.mutate(val, {
      onError: () => {
        if (mountedRef.current) {
          setEnabledState(prev);
          enabledRef.current = prev;
          AsyncStorage.setItem(STORAGE_KEY, prev ? "true" : "false").catch(() => {});
        }
      },
    });
  }, [updateMutation]);

  // Soppressione temporanea del pallino. SCELTA INTENZIONALE: solo i giochi arcade
  // (app/(tabs)/arcade.tsx) lo usano, perché sono Modal fullscreen che catturano
  // tutti i tocchi e un pallino flottante interferirebbe col gameplay. Le altre
  // schermate fullscreen (route planner, giro detail) NON sopprimono il widget di
  // proposito: il suo menu di navigazione resta utile lì e non cattura i tocchi
  // del contenuto sottostante (è un piccolo Animated.View con il solo handle).
  const suppressWidget = useCallback((val: boolean) => {
    setSuppressed(val);
  }, []);

  return (
    <FloatingWidgetContext.Provider value={{
      enabled,
      setEnabled,
      suppressed,
      suppressWidget,
      isUpdating: updateMutation.isPending,
    }}>
      {children}
    </FloatingWidgetContext.Provider>
  );
}

export function useFloatingWidget() {
  return useContext(FloatingWidgetContext);
}
