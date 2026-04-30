import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";

export type TaskbarStyle = "tutti" | "scorri" | "altro" | "raggruppa";

const STORAGE_KEY = "@bikerlink_taskbar_style";
const VALID_STYLES: TaskbarStyle[] = ["tutti", "scorri", "altro", "raggruppa"];
const FALLBACK: TaskbarStyle = "tutti";

interface TaskbarStyleContextType {
  taskbarStyle: TaskbarStyle;
  setTaskbarStyle: (style: TaskbarStyle) => void;
  adminDefault: TaskbarStyle;
  userHasCustomized: boolean;
}

const TaskbarStyleContext = createContext<TaskbarStyleContextType>({
  taskbarStyle: FALLBACK,
  setTaskbarStyle: () => {},
  adminDefault: FALLBACK,
  userHasCustomized: false,
});

export function TaskbarStyleProvider({ children }: { children: React.ReactNode }) {
  const [taskbarStyle, setTaskbarStyleState] = useState<TaskbarStyle>(FALLBACK);
  const [userHasCustomized, setUserHasCustomized] = useState(false);
  const [asyncStorageLoaded, setAsyncStorageLoaded] = useState(false);

  const { data: settingsData } = useQuery<{ defaultTaskbarStyle?: TaskbarStyle }>({
    queryKey: ["/api/settings/all"],
    staleTime: 120000,
    retry: false,
  });

  const adminDefault: TaskbarStyle = VALID_STYLES.includes(settingsData?.defaultTaskbarStyle as TaskbarStyle)
    ? settingsData!.defaultTaskbarStyle as TaskbarStyle
    : FALLBACK;

  // Al mount legge la preferenza utente da AsyncStorage.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && VALID_STYLES.includes(stored as TaskbarStyle)) {
        setTaskbarStyleState(stored as TaskbarStyle);
        setUserHasCustomized(true);
      }
      setAsyncStorageLoaded(true);
    }).catch(() => {
      setAsyncStorageLoaded(true);
    });
  }, []);

  // Quando l'admin cambia il default E l'utente non ha mai scelto
  // manualmente, aggiorna lo stile visualizzato.
  useEffect(() => {
    if (asyncStorageLoaded && !userHasCustomized) {
      setTaskbarStyleState(adminDefault);
    }
  }, [adminDefault, asyncStorageLoaded, userHasCustomized]);

  const setTaskbarStyle = useCallback((style: TaskbarStyle) => {
    setTaskbarStyleState(style);
    setUserHasCustomized(true);
    AsyncStorage.setItem(STORAGE_KEY, style).catch(() => {});
  }, []);

  return (
    <TaskbarStyleContext.Provider value={{ taskbarStyle, setTaskbarStyle, adminDefault, userHasCustomized }}>
      {children}
    </TaskbarStyleContext.Provider>
  );
}

export function useTaskbarStyle() {
  return useContext(TaskbarStyleContext);
}
