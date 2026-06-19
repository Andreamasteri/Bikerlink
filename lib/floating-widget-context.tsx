import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation } from "@tanstack/react-query";
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

  useEffect(() => {
    mountedRef.current = true;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (mountedRef.current && val !== null) {
        setEnabledState(val === "true");
      }
    });
    return () => { mountedRef.current = false; };
  }, []);

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
    setEnabledState(val);
    AsyncStorage.setItem(STORAGE_KEY, val ? "true" : "false").catch(() => {});
    updateMutation.mutate(val);
  }, [updateMutation]);

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
