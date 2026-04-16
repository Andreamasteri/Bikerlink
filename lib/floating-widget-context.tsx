import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

interface FloatingWidgetContextType {
  isVisible: boolean;
  unreadChat: number;
  unreadNotifications: number;
  suppressWidget: (suppress: boolean) => void;
}

const FloatingWidgetContext = createContext<FloatingWidgetContextType>({
  isVisible: false,
  unreadChat: 0,
  unreadNotifications: 0,
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

  const suppressWidget = useCallback((suppress: boolean) => {
    setSuppressed(suppress);
  }, []);

  return (
    <FloatingWidgetContext.Provider value={{
      isVisible,
      unreadChat,
      unreadNotifications,
      suppressWidget,
    }}>
      {children}
    </FloatingWidgetContext.Provider>
  );
}
