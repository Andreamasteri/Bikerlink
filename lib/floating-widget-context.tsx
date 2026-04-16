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
    await AsyncStorage.setItem(OVERLAY_PROMPTED_KEY, "true");
    OverlayNative.requestPermission();
  }, []);

  const suppressWidget = useCallback((suppress: boolean) => {
    setSuppressed(suppress);
  }, []);

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
