import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "uptime_widget_enabled";

interface UptimeWidgetContextValue {
  enabled: boolean;
  setEnabled: (val: boolean) => void;
}

const UptimeWidgetContext = createContext<UptimeWidgetContextValue>({
  enabled: true,
  setEnabled: () => {},
});

export function UptimeWidgetProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      setEnabledState(val === null ? true : val === "true");
    });
  }, []);

  const setEnabled = (val: boolean) => {
    setEnabledState(val);
    AsyncStorage.setItem(STORAGE_KEY, val ? "true" : "false");
  };

  return (
    <UptimeWidgetContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </UptimeWidgetContext.Provider>
  );
}

export function useUptimeWidget() {
  return useContext(UptimeWidgetContext);
}
