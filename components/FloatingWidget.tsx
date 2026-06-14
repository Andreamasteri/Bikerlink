import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useFloatingWidget } from "@/lib/floating-widget-context";
import { useTheme } from "@/lib/theme-context";

const WIDGET_SIZE = 48;
const POSITION_KEY = "floating_widget_position";
const TAP_THRESHOLD = 5;

export default function FloatingWidget() {
  const { isVisible, unreadChat, unreadNotifications, refetchBadges } = useFloatingWidget();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { width, height } = useWindowDimensions();
  const defaultX = width - WIDGET_SIZE - 16;
  const defaultY = height - WIDGET_SIZE - 90 - insets.bottom;

  const [positionLoaded, setPositionLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isTouching, setIsTouching] = useState(false);

  const insetsTop = useSharedValue(insets.top);
  const insetsBottom = useSharedValue(insets.bottom);
  useEffect(() => {
    insetsTop.value = insets.top;
    insetsBottom.value = insets.bottom;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top, insets.bottom]);

  const screenW = useSharedValue(width);
  const screenH = useSharedValue(height);
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      screenW.value = window.width;
      screenH.value = window.height;
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMountedRef = useRef(false);
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    const maxX = width - WIDGET_SIZE;
    const maxY = height - WIDGET_SIZE - 8 - insets.bottom;
    const minY = insets.top + 8;
    const clampedX = Math.max(0, Math.min(posX.value, maxX));
    const clampedY = Math.max(minY, Math.min(posY.value, maxY));
    if (clampedX !== posX.value) {
      posX.value = withTiming(clampedX, { duration: 250, easing: Easing.out(Easing.ease) });
    }
    if (clampedY !== posY.value) {
      posY.value = withTiming(clampedY, { duration: 250, easing: Easing.out(Easing.ease) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  const refetchBadgesRef = useRef(refetchBadges);
  useEffect(() => { refetchBadgesRef.current = refetchBadges; }, [refetchBadges]);

  const posX = useSharedValue(defaultX);
  const posY = useSharedValue(defaultY);
  const startX = useSharedValue(defaultX);
  const startY = useSharedValue(defaultY);
  const menuOpacity = useSharedValue(0);
  const menuOpenRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(POSITION_KEY).then((val) => {
      if (val) {
        try {
          const { x, y } = JSON.parse(val);
          const clampedX = Math.max(0, Math.min(x, width - WIDGET_SIZE));
          const clampedY = Math.max(insets.top + 8, Math.min(y, height - WIDGET_SIZE - 8 - insets.bottom));
          posX.value = clampedX;
          posY.value = clampedY;
        } catch {
          // no-op: fallback to default position if JSON is malformed
        }
      }
      setPositionLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMenu = useCallback(() => {
    refetchBadgesRef.current();
    menuOpenRef.current = true;
    setMenuOpen(true);
    menuOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });
  }, [menuOpacity]);

  const closeMenuJS = useCallback(() => {
    menuOpenRef.current = false;
    setMenuOpen(false);
  }, []);

  const closeMenu = useCallback(() => {
    menuOpenRef.current = false;
    menuOpacity.value = withTiming(0, { duration: 100, easing: Easing.in(Easing.ease) }, (finished) => {
      if (finished) runOnJS(closeMenuJS)();
    });
  }, [menuOpacity, closeMenuJS]);

  const handleTapJS = useCallback(() => {
    if (menuOpenRef.current) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [closeMenu, openMenu]);

  const savePositionJS = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ x, y }));
  }, []);

  const panGesture = Gesture.Pan()
    .minDistance(0)
    .onStart(() => {
      startX.value = posX.value;
      startY.value = posY.value;
      runOnJS(setIsTouching)(true);
    })
    .onUpdate((e) => {
      const rawX = startX.value + e.translationX;
      const rawY = startY.value + e.translationY;
      posX.value = Math.max(0, Math.min(rawX, screenW.value - WIDGET_SIZE));
      posY.value = Math.max(
        insetsTop.value + 8,
        Math.min(rawY, screenH.value - WIDGET_SIZE - 8 - insetsBottom.value),
      );
    })
    .onEnd((e) => {
      const dist = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
      runOnJS(savePositionJS)(posX.value, posY.value);
      runOnJS(setIsTouching)(false);
      if (dist <= TAP_THRESHOLD) {
        runOnJS(handleTapJS)();
      }
    });

  const widgetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  const menuAnimatedStyle = useAnimatedStyle(() => ({
    opacity: menuOpacity.value,
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

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

  if (!isVisible || !positionLoaded) return null;

  const totalUnread = unreadChat + unreadNotifications;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {menuOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
      )}

      {menuOpen && (
        <Animated.View
          style={[styles.menuContainer, menuAnimatedStyle]}
          pointerEvents="box-none"
        >
          <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.widgetContainer, widgetAnimatedStyle]}>
          <View
            style={[
              styles.ball,
              {
                backgroundColor: colors.accent,
                opacity: isTouching ? 1 : 0.9,
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
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  menuContainer: {
    position: "absolute",
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
  },
  widgetContainer: {
    position: "absolute",
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    elevation: 20,
    zIndex: 9999,
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
    elevation: 20,
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
    elevation: 20,
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
});
