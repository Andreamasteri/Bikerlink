import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { useRouter, useRootNavigationState, type Href } from "expo-router";
import { emitMatchNotification } from "@/lib/match-alert-emitter";

let Notifications: typeof import("expo-notifications") | null = null;
try {
  Notifications = require("expo-notifications");
} catch {
  // no-op: expo-notifications is optional or missing
}

function navigateFromNotifData(data: { type?: string; unreadChat?: number; routeId?: string } | undefined, router: ReturnType<typeof useRouter>) {
  if (data?.type === "weekly_recap") {
    router.push("/recap");
    return;
  }
  if (data?.type === "match") {
    router.push("/(tabs)/match" as Href);
    return;
  }
  if (data?.type === "planned_route_invite") {
    router.push("/(tabs)/match?tab=giri" as never);
    return;
  }
  if (data?.type !== "background_badge") return;
  if ((data?.unreadChat ?? 0) > 0) {
    router.push("/(tabs)/chat" as Href);
  } else {
    router.push("/notifications");
  }
}

function parseDeepLink(url: string): { type?: string; unreadChat?: number } | null {
  try {
    if (!url.startsWith("bikerlink://")) return null;
    const parsed = new URL(url);
    const type = parsed.searchParams.get("type") ?? undefined;
    const unreadChatStr = parsed.searchParams.get("unreadChat");
    const unreadChat = unreadChatStr != null ? parseInt(unreadChatStr, 10) : undefined;
    if (!type) return null;
    return { type, unreadChat };
  } catch {
    return null;
  }
}

export function BackgroundNotificationHandler() {
  const router = useRouter();
  const navState = useRootNavigationState();
  const isNavReady = !!(navState?.key);
  const pendingNavRef = useRef<{ type?: string; unreadChat?: number } | null>(null);
  const isNavReadyRef = useRef(isNavReady);
  const routerRef = useRef(router);

  // Sync both refs whenever isNavReady or router changes — no navigation here, safe.
  useEffect(() => {
    isNavReadyRef.current = isNavReady;
    routerRef.current = router;
  }, [isNavReady, router]);

  // Process any pending notification/deep-link navigation once the navigator is ready.
  // router removed from deps: use routerRef.current to avoid re-firing on every navigation.
  useEffect(() => {
    if (!isNavReady) return;
    if (pendingNavRef.current) {
      const data = pendingNavRef.current;
      pendingNavRef.current = null;
      navigateFromNotifData(data, routerRef.current);
    }
  }, [isNavReady]);

  // Register notification and deep-link listeners once on mount.
  // Empty deps: avoids re-registering on every navigation (which caused a loop when
  // router changed → effect re-ran → getLastNotificationResponseAsync re-fetched →
  // router.push → router changed again → …).
  // All navigation uses routerRef.current which is always kept up-to-date by the
  // sync effect above.
  useEffect(() => {
    function handleNavData(data: { type?: string; unreadChat?: number } | undefined) {
      if (!data) return;
      if (isNavReadyRef.current) {
        navigateFromNotifData(data, routerRef.current);
      } else {
        pendingNavRef.current = data;
      }
    }

    if (Notifications) {
      (async () => {
        try {
          const lastResponse = await Notifications.getLastNotificationResponseAsync();
          if (lastResponse) {
            const data = lastResponse.notification.request.content.data as { type?: string; unreadChat?: number } | undefined;
            handleNavData(data);
          }
        } catch {
          // no-op: ignore failures to get last notification response
        }
      })();
    }

    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const parsed = parseDeepLink(url);
      if (parsed) handleNavData(parsed);
    }).catch(() => {});

    let notifSub: { remove: () => void } | null = null;
    let foregroundSub: { remove: () => void } | null = null;
    if (Notifications) {
      try {
        notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data as { type?: string; unreadChat?: number } | undefined;
          handleNavData(data);
        });
      } catch {
        // no-op: ignore listener registration failures
      }
      try {
        foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
          const data = notification.request.content.data as { type?: string; matchName?: string; thumbnailUrl?: string } | undefined;
          if (data?.type === "match") {
            emitMatchNotification({
              matchName: data.matchName,
              thumbnailUrl: data.thumbnailUrl,
            });
          }
        });
      } catch {
        // no-op: ignore foreground listener registration failures
      }
    }

    const linkingSub = Linking.addEventListener("url", ({ url }) => {
      const parsed = parseDeepLink(url);
      if (parsed) navigateFromNotifData(parsed, routerRef.current);
    });

    return () => {
      notifSub?.remove();
      foregroundSub?.remove();
      linkingSub.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
