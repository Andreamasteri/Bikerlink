import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Platform,
  AppState,
  AppStateStatus,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFloatingWidget } from "@/lib/floating-widget-context";
import { useTheme } from "@/lib/theme-context";
import { OverlayNative } from "@/lib/overlay-native";

const WIDGET_SIZE = 48;
const POSITION_KEY = "floating_widget_position";
const TAP_THRESHOLD = 5;

export default function FloatingWidget() {
  const { isVisible, unreadChat, unreadNotifications, hasOverlayPermission, requestOverlayPermission } = useFloatingWidget();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { width, height } = Dimensions.get("window");
  const defaultX = width - WIDGET_SIZE - 16;
  const defaultY = height - WIDGET_SIZE - 90 - insets.bottom;

  const positionRef = useRef({ x: defaultX, y: defaultY });
  const [positionLoaded, setPositionLoaded] = useState(false);
  const pan = useRef(new Animated.ValueXY({ x: defaultX, y: defaultY })).current;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuOpenRef = useRef(false);
  const [isTouching, setIsTouching] = useState(false);
  const dragDistanceRef = useRef(0);
  const menuOpacity = useRef(new Animated.Value(0)).current;

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const overlayActiveRef = useRef(false);

  const unreadChatRef = useRef(unreadChat);
  const unreadNotifRef = useRef(unreadNotifications);
  useEffect(() => { unreadChatRef.current = unreadChat; }, [unreadChat]);
  useEffect(() => { unreadNotifRef.current = unreadNotifications; }, [unreadNotifications]);

  const openMenu = useCallback(() => {
    menuOpenRef.current = true;
    setMenuOpen(true);
    Animated.timing(menuOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [menuOpacity]);

  const closeMenu = useCallback(() => {
    menuOpenRef.current = false;
    Animated.timing(menuOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setMenuOpen(false);
    });
  }, [menuOpacity]);

  React.useEffect(() => {
    AsyncStorage.getItem(POSITION_KEY).then((val) => {
      if (val) {
        try {
          const { x, y } = JSON.parse(val);
          const clampedX = Math.max(0, Math.min(x, width - WIDGET_SIZE));
          const clampedY = Math.max(insets.top + 8, Math.min(y, height - WIDGET_SIZE - 8));
          positionRef.current = { x: clampedX, y: clampedY };
          pan.setValue({ x: clampedX, y: clampedY });
        } catch {}
      }
      setPositionLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || !isVisible || !hasOverlayPermission) return;

    if (AppState.currentState === "active" && overlayActiveRef.current) {
      OverlayNative.hideOverlay();
      overlayActiveRef.current = false;
    }

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        prevState === "active" &&
        (nextState === "background" || nextState === "inactive")
      ) {
        OverlayNative.showOverlay(unreadChatRef.current, unreadNotifRef.current);
        overlayActiveRef.current = true;
      } else if (nextState === "active" && overlayActiveRef.current) {
        OverlayNative.hideOverlay();
        overlayActiveRef.current = false;
      }
    });

    return () => {
      subscription.remove();
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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragDistanceRef.current = 0;
        pan.setOffset({
          x: positionRef.current.x,
          y: positionRef.current.y,
        });
        pan.setValue({ x: 0, y: 0 });
        setIsTouching(true);
      },
      onPanResponderMove: (evt, gestureState) => {
        const dist = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        dragDistanceRef.current = dist;
        Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        })(evt, gestureState);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        pan.flattenOffset();

        const screenWidth = Dimensions.get("window").width;
        const screenHeight = Dimensions.get("window").height;
        const rawX = positionRef.current.x + gestureState.dx;
        const rawY = positionRef.current.y + gestureState.dy;

        const clampedX = Math.max(0, Math.min(rawX, screenWidth - WIDGET_SIZE));
        const clampedY = Math.max(insets.top + 8, Math.min(rawY, screenHeight - WIDGET_SIZE - 8));

        positionRef.current = { x: clampedX, y: clampedY };
        pan.setValue({ x: clampedX, y: clampedY });

        AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ x: clampedX, y: clampedY }));

        if (dragDistanceRef.current <= TAP_THRESHOLD) {
          if (menuOpenRef.current) {
            menuOpenRef.current = false;
            Animated.timing(menuOpacity, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
              setMenuOpen(false);
            });
          } else {
            menuOpenRef.current = true;
            setMenuOpen(true);
            Animated.timing(menuOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
          }
        }
        setIsTouching(false);
      },
    })
  ).current;

  const handleChatPress = useCallback(() => {
    closeMenu();
    router.push("/(tabs)/chat");
  }, [closeMenu, router]);

  const handleNotificationsPress = useCallback(() => {
    closeMenu();
    router.push("/notifications" as Href);
  }, [closeMenu, router]);

  const handlePlayerPress = useCallback(() => {
    closeMenu();
    router.push("/(tabs)/music");
  }, [closeMenu, router]);

  const handlePermissionBannerPress = useCallback(() => {
    Alert.alert(
      "Permesso necessario",
      'Per mostrare il pallino quando esci dall\'app, concedi il permesso "Mostra sopra le altre app".\n\n📱 Dove trovarlo:\nInfo App → Avanzate → "Mostra sopra le altre app"\n\n⚠️ Non è in Permessi → Posizione. Cerca specificamente "Mostra sopra le altre app".',
      [
        { text: "Annulla", style: "cancel" },
        { text: "Apri Impostazioni", onPress: requestOverlayPermission },
      ]
    );
  }, [requestOverlayPermission]);

  if (!isVisible || !positionLoaded) return null;
  if (Platform.OS === "web") return null;

  const totalUnread = unreadChat + unreadNotifications;

  return (
    <>
      {menuOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      )}

      {menuOpen && (
        <Animated.View
          style={[
            styles.menuContainer,
            { opacity: menuOpacity, transform: [{ translateX: pan.x }, { translateY: pan.y }] },
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.menu,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                bottom: WIDGET_SIZE + 8,
                right: 0,
              },
            ]}
          >
            <TouchableOpacity style={styles.menuItem} onPress={handleChatPress} activeOpacity={0.7}>
              <Ionicons name="chatbubbles" size={18} color={colors.accent} />
              <Text style={[styles.menuLabel, { color: colors.text }]}>Chat</Text>
              {unreadChat > 0 && (
                <View style={[styles.menuBadge, { backgroundColor: colors.accent }]}>
                  <Text style={styles.menuBadgeText}>{unreadChat > 99 ? "99+" : unreadChat}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={handleNotificationsPress} activeOpacity={0.7}>
              <Ionicons name="notifications" size={18} color={colors.accent} />
              <Text style={[styles.menuLabel, { color: colors.text }]}>Notifiche</Text>
              {unreadNotifications > 0 && (
                <View style={[styles.menuBadge, { backgroundColor: colors.accentRed ?? "#FF3B30" }]}>
                  <Text style={styles.menuBadgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity style={styles.menuItem} onPress={handlePlayerPress} activeOpacity={0.7}>
              <Ionicons name="musical-notes" size={18} color={colors.accent} />
              <Text style={[styles.menuLabel, { color: colors.text }]}>Player</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      <Animated.View
        style={[
          styles.widgetContainer,
          { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
        ]}
        {...panResponder.panHandlers}
      >
        <View
          style={[
            styles.ball,
            {
              backgroundColor: colors.primary ?? colors.accent,
              opacity: isTouching ? 1 : 0.85,
            },
          ]}
        >
          <Ionicons name="notifications" size={22} color="#fff" />
          {totalUnread > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.accentRed ?? "#FF3B30" }]}>
              <Text style={styles.badgeText}>{totalUnread > 99 ? "99+" : totalUnread}</Text>
            </View>
          )}
        </View>
      </Animated.View>

      {Platform.OS === "android" && !hasOverlayPermission && (
        <Pressable
          style={[
            styles.permissionBanner,
            {
              bottom: insets.bottom + 90,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          onPress={handlePermissionBannerPress}
        >
          <Ionicons name="layers-outline" size={18} color={colors.accent} />
          <View style={styles.permissionBannerContent}>
            <Text
              style={[styles.permissionBannerText, { color: colors.text }]}
              numberOfLines={1}
            >
              Attiva widget in background
            </Text>
            <Text
              style={[styles.permissionBannerSub, { color: colors.textSecondary ?? colors.text }]}
              numberOfLines={1}
            >
              Separato da Posizione — cerca "Mostra sopra le altre app"
            </Text>
          </View>
          <Text style={[styles.permissionBannerCta, { color: colors.accent }]}>Attiva →</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  menuContainer: {
    position: "absolute",
    zIndex: 9998,
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
  },
  widgetContainer: {
    position: "absolute",
    zIndex: 9999,
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
  },
  ball: {
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    borderRadius: WIDGET_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700" as const,
    lineHeight: 12,
  },
  menu: {
    position: "absolute",
    right: 0,
    bottom: WIDGET_SIZE + 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 160,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500" as const,
  },
  menuBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  menuBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  menuDivider: {
    height: 1,
    marginHorizontal: 0,
  },
  permissionBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  permissionBannerContent: {
    flex: 1,
    gap: 2,
  },
  permissionBannerText: {
    fontSize: 13,
    fontWeight: "600" as const,
  },
  permissionBannerSub: {
    fontSize: 11,
    fontWeight: "400" as const,
    opacity: 0.75,
  },
  permissionBannerCta: {
    fontSize: 13,
    fontWeight: "700" as const,
  },
});
