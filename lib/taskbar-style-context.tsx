import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type TaskbarStyle = "scorri" | "raggruppa";

const STORAGE_KEY = "@bikerlink_taskbar_style";
const VALID_STYLES: TaskbarStyle[] = ["scorri", "raggruppa"];
const FALLBACK: TaskbarStyle = "raggruppa";

interface TaskbarStyleContextType {
  taskbarStyle: TaskbarStyle;
  setTaskbarStyle: (style: TaskbarStyle) => void;
  userHasCustomized: boolean;
}

const TaskbarStyleContext = createContext<TaskbarStyleContextType>({
  taskbarStyle: FALLBACK,
  setTaskbarStyle: () => {},
  userHasCustomized: false,
});

export function TaskbarStyleProvider({ children }: { children: React.ReactNode }) {
  const [taskbarStyle, setTaskbarStyleState] = useState<TaskbarStyle>(FALLBACK);
  const [userHasCustomized, setUserHasCustomized] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        if (VALID_STYLES.includes(stored as TaskbarStyle)) {
          setTaskbarStyleState(stored as TaskbarStyle);
          setUserHasCustomized(true);
        } else {
          setTaskbarStyleState(FALLBACK);
          AsyncStorage.setItem(STORAGE_KEY, FALLBACK).catch(() => {});
        }
      }
    }).catch(() => {});
  }, []);

  const setTaskbarStyle = useCallback((style: TaskbarStyle) => {
    setTaskbarStyleState(style);
    setUserHasCustomized(true);
    AsyncStorage.setItem(STORAGE_KEY, style).catch(() => {});
  }, []);

  const contextValue = useMemo(
    () => ({ taskbarStyle, setTaskbarStyle, userHasCustomized }),
    [taskbarStyle, setTaskbarStyle, userHasCustomized]
  );

  return (
    <TaskbarStyleContext.Provider value={contextValue}>
      {children}
    </TaskbarStyleContext.Provider>
  );
}

export function useTaskbarStyle() {
  return useContext(TaskbarStyleContext);
}
