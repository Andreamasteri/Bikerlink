import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { OverlayNative } from "@/lib/overlay-native";

interface FloatingWidgetContextType {
  isVisible: boolean;
  unreadChat: number;
  unreadNotifications: number;
  hasOverlayPermission: boolean;
  requestOverlayPermission: () => void;
}

const FloatingWidgetContext = createContext<FloatingWidgetContextType>({
  isVisible: false,
  unreadChat: 0,
  unreadNotifications: 0,
  hasOverlayPermission: false,
  requestOverlayPermission: () => {},
});

export function useFloatingWidget() {
  return useContext(FloatingWidgetContext);
}

export function FloatingWidgetProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data: adminSetting } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
  });

  const adminEnabled = adminSetting?.enabled !== false;
  const userEnabled = user?.floatingWidgetEnabled !== false;
  const isLoggedIn = !!user;
  const isWeb = Platform.OS === "web";

  const isVisible = isLoggedIn && adminEnabled && userEnabled && !isWeb;

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
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        OverlayNative.checkPermission().then(setHasOverlayPermission);
      }
    });
    return () => sub.remove();
  }, []);

  const requestOverlayPermission = () => {
    OverlayNative.requestPermission();
  };

  return (
    <FloatingWidgetContext.Provider value={{
      isVisible,
      unreadChat,
      unreadNotifications,
      hasOverlayPermission,
      requestOverlayPermission,
    }}>
      {children}
    </FloatingWidgetContext.Provider>
  );
}
