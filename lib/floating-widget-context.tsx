import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // no-op: notifications module might not be available
}

const NOTIF_ID = "bikerlink-background-badge";

function buildNotifBody(chat: number, notif: number): string {
  if (chat > 0 && notif > 0) return `${chat} messaggi, ${notif} notifiche`;
  if (chat > 0) return `${chat} ${chat === 1 ? "messaggio" : "messaggi"} non letto`;
  return `${notif} ${notif === 1 ? "notifica" : "notifiche"} non letta`;
}

async function scheduleBackgroundNotif(chat: number, notif: number) {
  if (!Notifications) return;
  const total = chat + notif;
  if (total === 0) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIF_ID,
      content: {
        title: "BikerLink",
        body: buildNotifBody(chat, notif),
        data: { type: "background_badge", unreadChat: chat, unreadNotif: notif },
        ...(Platform.OS === "android" ? { channelId: "bikerlink-bg" } : {}),
      },
      trigger: null,
    });
  } catch {
    // no-op: background notification scheduling is best-effort
  }
}

async function dismissBackgroundNotif() {
  if (!Notifications) return;
  try {
    await Notifications.dismissNotificationAsync(NOTIF_ID);
  } catch {
    // no-op: dismissing background notif is best-effort
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(NOTIF_ID);
  } catch {
    // no-op: cancelling scheduled background notif is best-effort
  }
}

async function setAppBadge(count: number) {
  if (!Notifications || Platform.OS !== "ios") return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // no-op: setting app badge is best-effort
  }
}

async function clearAppBadge() {
  if (!Notifications || Platform.OS !== "ios") return;
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // no-op: clearing app badge is best-effort
  }
}

interface FloatingWidgetContextType {
  isVisible: boolean;
  unreadChat: number;
  unreadNotifications: number;
  suppressWidget: (suppress: boolean) => void;
  refetchBadges: () => void;
}

const FloatingWidgetContext = createContext<FloatingWidgetContextType>({
  isVisible: false,
  unreadChat: 0,
  unreadNotifications: 0,
  suppressWidget: () => {},
  refetchBadges: () => {},
});

export function useFloatingWidget() {
  return useContext(FloatingWidgetContext);
}

export function FloatingWidgetProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [suppressed, setSuppressed] = useState(false);

  const userEnabled = user?.floatingWidgetEnabled !== false;
  const isLoggedIn = !!user;
  const { data: adminWidgetData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/floating-widget"],
    staleTime: 60_000,
    refetchInterval: 60_000,
    // Keep the last known value during brief backend restarts so visibility
    // doesn't flip on a transient network failure.
    placeholderData: keepPreviousData,
  });
  const adminEnabled = adminWidgetData?.enabled !== false;

  const isVisible = isLoggedIn && userEnabled && adminEnabled && !suppressed;

  const { data: unreadChatData, refetch: refetchChat } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/conversations/unread-total"],
    enabled: isVisible,
    refetchInterval: isVisible ? 5_000 : false,
    // Keep the previous badge count if a refetch fails during a backend
    // restart instead of flashing to 0.
    placeholderData: keepPreviousData,
  });

  const { data: notificationsData, refetch: refetchNotif } = useQuery<Array<{ isRead: boolean }>>({
    queryKey: ["/api/notifications"],
    enabled: isVisible,
    refetchInterval: isVisible ? 5_000 : false,
    placeholderData: keepPreviousData,
  });

  const refetchBadges = useCallback(() => {
    void refetchChat();
    void refetchNotif();
  }, [refetchChat, refetchNotif]);

  const unreadChat = unreadChatData?.count ?? 0;
  const unreadNotifications = useMemo(() => {
    if (!notificationsData) return 0;
    return notificationsData.filter((n) => !n.isRead).length;
  }, [notificationsData]);

  const unreadChatRef = useRef(unreadChat);
  const unreadNotifRef = useRef(unreadNotifications);
  useEffect(() => { unreadChatRef.current = unreadChat; }, [unreadChat]);
  useEffect(() => { unreadNotifRef.current = unreadNotifications; }, [unreadNotifications]);

  useEffect(() => {
    if ((Platform.OS !== "android" && Platform.OS !== "ios") || !isLoggedIn || !Notifications) return;

    let permissionGranted = false;

    async function requestPermission() {
      if (!Notifications) return;
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        permissionGranted = status === "granted";
        if (permissionGranted && Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("bikerlink-bg", {
            name: "BikerLink in background",
            importance: Notifications.AndroidImportance.DEFAULT,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
            showBadge: true,
            enableVibrate: false,
            enableLights: false,
          });
        }
      } catch {
        // no-op: notification channel creation is best-effort
      }
    }

    requestPermission();

    const appStateRef = { current: AppState.currentState };

    const sub = AppState.addEventListener("change", async (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev === "active" && (nextState === "background" || nextState === "inactive")) {
        if (permissionGranted) {
          await scheduleBackgroundNotif(unreadChatRef.current, unreadNotifRef.current);
          await setAppBadge(unreadChatRef.current + unreadNotifRef.current);
        }
      } else if (nextState === "active" && prev !== "active") {
        await dismissBackgroundNotif();
        await clearAppBadge();
      }
    });

    return () => {
      sub.remove();
      dismissBackgroundNotif();
      clearAppBadge();
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if ((Platform.OS !== "android" && Platform.OS !== "ios") || !Notifications) return;
    (async () => {
      if (AppState.currentState !== "active") {
        await scheduleBackgroundNotif(unreadChatRef.current, unreadNotifRef.current);
        await setAppBadge(unreadChatRef.current + unreadNotifRef.current);
      }
    })();
  }, [unreadChat, unreadNotifications]);

  const suppressWidget = useCallback((suppress: boolean) => {
    setSuppressed(suppress);
  }, []);

  return (
    <FloatingWidgetContext.Provider value={{
      isVisible,
      unreadChat,
      unreadNotifications,
      suppressWidget,
      refetchBadges,
    }}>
      {children}
    </FloatingWidgetContext.Provider>
  );
}
