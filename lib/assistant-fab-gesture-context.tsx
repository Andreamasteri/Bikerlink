// Task #4449 — Shared gesture ref between AssistantFab (FAB AI, bottom-left) and
// FloatingWidget (ball, full-screen backdrop when its menu is open).
//
// The FloatingWidget renders a full-screen GestureDetector backdrop while its
// menu is open. That backdrop overlaps the AssistantFab corner, so on Android
// RNGH's native hit-test could route a tap on the FAB to the backdrop instead.
// By sharing the FAB's gesture via this ref, the backdrop can declare
// `simultaneousWithExternalGesture(fabGestureRef)` — tapping the FAB then opens
// the AI sheet AND closes the menu, rather than being swallowed.
import React, { createContext, useContext, useRef } from "react";
import type { GestureType } from "react-native-gesture-handler";

export type AssistantFabGestureRef = React.MutableRefObject<GestureType | undefined>;

// Module-level fallback so consumers used WITHOUT a provider still share ONE
// stable ref object (coordination keeps working; nothing crashes if the provider
// is ever missing — e.g. in isolated tests).
const fallbackRef: AssistantFabGestureRef = { current: undefined };

const AssistantFabGestureContext = createContext<AssistantFabGestureRef>(fallbackRef);

export function AssistantFabGestureProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<GestureType | undefined>(undefined);
  return (
    <AssistantFabGestureContext.Provider value={ref}>
      {children}
    </AssistantFabGestureContext.Provider>
  );
}

export function useAssistantFabGestureRef(): AssistantFabGestureRef {
  return useContext(AssistantFabGestureContext);
}
