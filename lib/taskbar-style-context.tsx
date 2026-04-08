import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type TaskbarStyle = "tutti" | "scorri" | "altro" | "raggruppa";

const STORAGE_KEY = "@bikerlink_taskbar_style";
const VALID_STYLES: TaskbarStyle[] = ["tutti", "scorri", "altro", "raggruppa"];

interface TaskbarStyleContextType {
  taskbarStyle: TaskbarStyle;
  setTaskbarStyle: (style: TaskbarStyle) => void;
}

const TaskbarStyleContext = createContext<TaskbarStyleContextType>({
  taskbarStyle: "tutti",
  setTaskbarStyle: () => {},
});

export function TaskbarStyleProvider({ children }: { children: React.ReactNode }) {
  const [taskbarStyle, setTaskbarStyleState] = useState<TaskbarStyle>("tutti");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && VALID_STYLES.includes(stored as TaskbarStyle)) {
        setTaskbarStyleState(stored as TaskbarStyle);
      }
    }).catch(() => {});
  }, []);

  const setTaskbarStyle = useCallback((style: TaskbarStyle) => {
    setTaskbarStyleState(style);
    AsyncStorage.setItem(STORAGE_KEY, style).catch(() => {});
  }, []);

  return (
    <TaskbarStyleContext.Provider value={{ taskbarStyle, setTaskbarStyle }}>
      {children}
    </TaskbarStyleContext.Provider>
  );
}

export function useTaskbarStyle() {
  return useContext(TaskbarStyleContext);
}
