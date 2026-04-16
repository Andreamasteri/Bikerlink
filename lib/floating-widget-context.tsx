import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { OverlayNative, overlayNativeSupported } from "@/lib/overlay-native";

const OVERLAY_PROMPTED_KEY = "overlay_permission_prompted";

interface FloatingWidgetContextType {
  isVisible: boolean;
  unreadChat: number;
  unreadNotifications: number;
  hasOverlayPermission: boolean;
  requestOverlayPermission: () => void;
  suppressWidget: (suppress: boolean) => void;
}

const FloatingWidgetContext = createContext<FloatingWidgetContextType>({
  isVisible: false,
  unreadChat: 0,
  unreadNotifications: 0,
  hasOverlayPermission: false,
  requestOverlayPermission: () => {},
  suppressWidget: () => {},
});

export function useFloatingWidget() {
  return useContext(FloatingWidgetContext);
}

export function FloatingWidgetProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [suppressed, setSuppressed] = useState(false);

  const { data: adminSetting } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
  });

  const adminEnabled = adminSetting?.enabled !== false;
  const userEnabled = user?.floatingWidgetEnabled !== false;
  const isLoggedIn = !!user;
  const isWeb = Platform.OS === "web";

  const isVisible = isLoggedIn && adminEnabled && userEnabled && !isWeb && !suppressed;

  const { data: unreadChatData } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/unread-total"],
    enabled: isVisible,
    refetchInterval: isVisible ? 15_000 : false,
  });

  const { data: notificationsData } = useQuery<Array<{ isRead: boolean }>>({
    queryKey: ["/api/notifications"],
    enabled: isVisible,
    refetchInterval: isVisible ? 15_000 : false,
  });

  const unreadChat = unreadChatData?.count ?? 0;
  const unreadNotifications = useMemo(() => {
    if (!notificationsData) return 0;
    return notificationsData.filter((n) => !n.isRead).length;
  }, [notificationsData]);

  const [hasOverlayPermission, setHasOverlayPermission] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android" || !isVisible) return;
    OverlayNative.checkPermission().then(setHasOverlayPermission);
  }, [isVisible]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = AppState.addEventListener("change", async (state: AppStateStatus) => {
      if (state === "active") {
        const hasPermission = await OverlayNative.checkPermission();
        if (!hasPermission && !overlayNativeSupported) {
          const wasPrompted = await AsyncStorage.getItem(OVERLAY_PROMPTED_KEY);
          if (wasPrompted === "true") {
            await AsyncStorage.removeItem(OVERLAY_PROMPTED_KEY);
            setHasOverlayPermission(true);
            return;
          }
        }
        setHasOverlayPermission(hasPermission);
      }
    });
    return () => sub.remove();
  }, []);

  const requestOverlayPermission = useCallback(async () => {
    if (!overlayNativeSupported) {
      await AsyncStorage.setItem(OVERLAY_PROMPTED_KEY, "true");
    }
    OverlayNative.requestPermission();
  }, []);

  const suppressWidget = useCallback((suppress: boolean) => {
    setSuppressed(suppress);
  }, []);

  // --- Overlay Android: mostra pallino nativo quando app è in background ---
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const overlayActiveRef = useRef(false);

  const unreadChatRef = useRef(unreadChat);
  const unreadNotifRef = useRef(unreadNotifications);
  useEffect(() => { unreadChatRef.current = unreadChat; }, [unreadChat]);
  useEffect(() => { unreadNotifRef.current = unreadNotifications; }, [unreadNotifications]);

  useEffect(() => {
    if (Platform.OS !== "android" || !isVisible || !hasOverlayPermission) {
      if (overlayActiveRef.current) {
        OverlayNative.hideOverlay();
        overlayActiveRef.current = false;
      }
      return;
    }

    if (AppState.currentState === "active" && overlayActiveRef.current) {
      OverlayNative.hideOverlay();
      overlayActiveRef.current = false;
    } else if ((AppState.currentState === "background" || AppState.currentState === "inactive") && !overlayActiveRef.current) {
      OverlayNative.showOverlay(unreadChatRef.current, unreadNotifRef.current);
      overlayActiveRef.current = true;
    }

    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (prevState === "active" && (nextState === "background" || nextState === "inactive")) {
        OverlayNative.showOverlay(unreadChatRef.current, unreadNotifRef.current);
        overlayActiveRef.current = true;
      } else if (nextState === "active" && overlayActiveRef.current) {
        OverlayNative.hideOverlay();
        overlayActiveRef.current = false;
      }
    });

    return () => {
      sub.remove();
      if (overlayActiveRef.current) {
        OverlayNative.hideOverlay();
        overlayActiveRef.current = false;
      }
    };
  }, [isVisible, hasOverlayPermission]);

  useEffect(() => {
    if (Platform.OS !== "android" || !overlayActiveRef.current) return;
    OverlayNative.updateBadges(unreadChat, unreadNotifications);
  }, [unreadChat, unreadNotifications]);

  return (
    <FloatingWidgetContext.Provider value={{
      isVisible,
      unreadChat,
      unreadNotifications,
      hasOverlayPermission,
      requestOverlayPermission,
      suppressWidget,
    }}>
      {children}
    </FloatingWidgetContext.Provider>
  );
}
