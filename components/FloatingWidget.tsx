import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
  BackHandler,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname, type Href } from "expo-router";
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
export const TAP_THRESHOLD = 5;
export const SWIPE_DISMISS_THRESHOLD = 60;
export const SWIPE_VELOCITY_THRESHOLD = 500;

export default function FloatingWidget() {
  const { isVisible, unreadChat, unreadNotifications, refetchBadges } = useFloatingWidget();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

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
  const menuTranslateY = useSharedValue(0);
  // Measured menu size, used to anchor the panel's bottom-right corner just
  // above-right of the ball when it is rendered at the root level (see
  // menuAnimatedStyle). Seeded with sensible estimates to minimise the first
  // open's positioning jump before onLayout reports the real size.
  const menuW = useSharedValue(160);
  const menuH = useSharedValue(158);
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

  const closeMenuSlideDown = useCallback(() => {
    menuOpenRef.current = false;
    menuOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.ease) });
    menuTranslateY.value = withTiming(120, { duration: 200, easing: Easing.in(Easing.ease) }, (finished) => {
      if (finished) runOnJS(closeMenuJS)();
    });
  }, [menuOpacity, menuTranslateY, closeMenuJS]);

  const openMenu = useCallback(() => {
    refetchBadgesRef.current();
    menuTranslateY.value = 0;
    menuOpenRef.current = true;
    setMenuOpen(true);
    menuOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });
  }, [menuOpacity, menuTranslateY]);

  const handleTapJS = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (menuOpenRef.current) {
      closeMenu();
    } else {
      openMenu();
    }
  }, [closeMenu, openMenu]);

  const savePositionJS = useCallback((x: number, y: number) => {
    AsyncStorage.setItem(POSITION_KEY, JSON.stringify({ x, y }));
  }, []);

  // Close menu when route/tab changes
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathnameRef.current !== pathname && menuOpenRef.current) {
      closeMenu();
    }
    pathnameRef.current = pathname;
  }, [pathname, closeMenu]);

  // Close menu on Android Back button
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (menuOpenRef.current) {
        closeMenu();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [closeMenu]);

  const triggerDragHaptic = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  // Tap gesture — fires only if pan doesn't activate (Exclusive gives pan priority)
  const tapGesture = Gesture.Tap()
    .onEnd((_e, success) => {
      "worklet";
      if (success) runOnJS(handleTapJS)();
    });

  // Pan gesture — runs on UI thread for smooth drag; JS calls via runOnJS
  const panGesture = Gesture.Pan()
    .minDistance(TAP_THRESHOLD + 1)
    .onStart(() => {
      "worklet";
      startX.value = posX.value;
      startY.value = posY.value;
      runOnJS(setIsTouching)(true);
      runOnJS(triggerDragHaptic)();
    })
    .onUpdate((e) => {
      "worklet";
      const rawX = startX.value + e.translationX;
      const rawY = startY.value + e.translationY;
      posX.value = Math.max(0, Math.min(rawX, screenW.value - WIDGET_SIZE));
      posY.value = Math.max(
        insetsTop.value + 8,
        Math.min(rawY, screenH.value - WIDGET_SIZE - 8 - insetsBottom.value),
      );
    })
    .onEnd(() => {
      "worklet";
      runOnJS(savePositionJS)(posX.value, posY.value);
    })
    .onFinalize(() => {
      "worklet";
      runOnJS(setIsTouching)(false);
    });

  // Exclusive: pan has priority on all platforms (including web);
  // tap fires only when pan threshold is never reached.
  const composedGesture = Gesture.Exclusive(panGesture, tapGesture);

  // Navigation handlers — DECLARED BEFORE the gesture objects below. The
  // gesture worklets capture these via runOnJS(); under Hermes a `const`
  // referenced before its declaration is in the Temporal Dead Zone, so having
  // them above the gestures avoids a ReferenceError (e.g. on "Notifiche").
  // They close the menu SYNCHRONOUSLY (closeMenuJS) before navigating so the
  // full-screen backdrop is removed immediately and can't swallow touches or
  // linger during the route transition.
  const handleChatPress = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    closeMenuJS();
    router.push("/(tabs)/chat");
  }, [closeMenuJS, router]);

  const handleNotificationsPress = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    closeMenuJS();
    router.push("/notifications" as Href);
  }, [closeMenuJS, router]);

  const handlePlayerPress = useCallback(() => {
    if (Platform.OS !== "web") {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    closeMenuJS();
    router.push("/(tabs)/music");
  }, [closeMenuJS, router]);

  // Menu item tap gestures — Gesture.Tap() keeps all touch handling in the
  // RNGH native layer, eliminating conflicts with the parent Exclusive gesture
  // on Android (TouchableOpacity runs in the JS touch system and could be
  // swallowed by the parent GestureDetector before reaching the item).
  const chatTapGesture = Gesture.Tap()
    .onEnd((_e, success) => {
      "worklet";
      if (success) runOnJS(handleChatPress)();
    });

  const notificationsTapGesture = Gesture.Tap()
    .onEnd((_e, success) => {
      "worklet";
      if (success) runOnJS(handleNotificationsPress)();
    });

  const playerTapGesture = Gesture.Tap()
    .onEnd((_e, success) => {
      "worklet";
      if (success) runOnJS(handlePlayerPress)();
    });

  // Backdrop tap gesture — lives in the same RNGH native layer as the menu item
  // gestures, so on Android the two systems (RNGH vs JS Pressable) can no longer
  // fire simultaneously. Touches that land on the menu panel never reach this
  // gesture because the panel is rendered on top (higher z-order) and RNGH's hit
  // test routes the touch to the topmost view.
  const backdropTapGesture = Gesture.Tap()
    .onEnd((_e, success) => {
      "worklet";
      if (success) runOnJS(closeMenu)();
    });

  // Swipe-down-to-dismiss gesture on the menu panel
  const menuPanGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(8)
    .onUpdate((e) => {
      if (e.translationY > 0) {
        menuTranslateY.value = e.translationY;
        menuOpacity.value = Math.max(0, 1 - e.translationY / 160);
      }
    })
    .onEnd((e) => {
      const shouldDismiss =
        e.translationY > SWIPE_DISMISS_THRESHOLD ||
        e.velocityY > SWIPE_VELOCITY_THRESHOLD;
      if (shouldDismiss) {
        // menuPanGesture runs on the JS thread (.runOnJS(true)), so call the
        // JS closer directly — wrapping it in runOnJS() here caused a
        // double-dispatch that produced phantom dismiss animations.
        closeMenuSlideDown();
      } else {
        menuTranslateY.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.ease) });
        menuOpacity.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) });
      }
    });

  const widgetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value }, { translateY: posY.value }],
  }));

  // Menu now lives at the ROOT absoluteFill level (not nested inside the 48×48
  // widgetContainer), so it must reproduce the widget-follow + above/right
  // anchoring itself. We position its top-left corner with an explicit transform
  // derived from the ball position and the measured menu size, clamping to the
  // screen so the panel stays fully on-screen (and therefore tappable on
  // Android, where out-of-bounds views never receive touch). menuTranslateY adds
  // the swipe-to-dismiss offset.
  const menuAnimatedStyle = useAnimatedStyle(() => {
    const minX = 8;
    const maxX = Math.max(minX, screenW.value - menuW.value - 8);
    let tx = posX.value + WIDGET_SIZE - menuW.value;
    tx = Math.min(Math.max(tx, minX), maxX);
    const ty = Math.max(insetsTop.value + 8, posY.value - 8 - menuH.value);
    return {
      opacity: menuOpacity.value,
      transform: [{ translateX: tx }, { translateY: ty + menuTranslateY.value }],
    };
  });

  if (!isVisible || !positionLoaded) return null;

  const totalUnread = unreadChat + unreadNotifications;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop: catches taps outside the menu at root level.
          Uses GestureDetector+Gesture.Tap() (RNGH native layer) so it lives in
          the same gesture system as the menu item GestureDetectors. On Android
          a Pressable (JS touch layer) would fire simultaneously with the RNGH
          item gestures, causing a navigation conflict that closes/resets the
          screen. Sharing the RNGH layer means RNGH's native hit-test routes the
          touch to exactly ONE target — either the backdrop or a menu item. */}
      {menuOpen && (
        <GestureDetector gesture={backdropTapGesture}>
          <Animated.View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      )}

      {/* Menu rendered at the ROOT absoluteFill level (a sibling of the ball),
          NOT nested inside the 48×48 widgetContainer. On Android a child
          rendered outside its parent's bounds does not receive touches, which is
          why the menu items were dead in the native APK (the panel sits ~56px
          above the ball, well outside the 48×48 container). Living directly under
          the root View and positioning itself via menuAnimatedStyle keeps the
          whole hitbox inside its parent, so each item's GestureDetector receives
          taps reliably. */}
      {menuOpen && (
        <GestureDetector gesture={menuPanGesture}>
          <Animated.View style={[styles.menuWrapper, menuAnimatedStyle]}>
            <View
              style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onLayout={(e) => {
                menuW.value = e.nativeEvent.layout.width;
                menuH.value = e.nativeEvent.layout.height;
              }}
            >
              <GestureDetector gesture={chatTapGesture}>
                <View style={styles.menuItem}>
                  <Ionicons name="chatbubbles" size={18} color={colors.accent} />
                  <Text style={[styles.menuLabel, { color: colors.text }]}>Chat</Text>
                  {unreadChat > 0 && (
                    <View style={[styles.menuBadge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.menuBadgeText}>{unreadChat > 99 ? "99+" : unreadChat}</Text>
                    </View>
                  )}
                </View>
              </GestureDetector>

              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

              <GestureDetector gesture={notificationsTapGesture}>
                <View style={styles.menuItem}>
                  <Ionicons name="notifications" size={18} color={colors.accent} />
                  <Text style={[styles.menuLabel, { color: colors.text }]}>Notifiche</Text>
                  {unreadNotifications > 0 && (
                    <View style={[styles.menuBadge, { backgroundColor: colors.accentRed ?? "#FF3B30" }]}>
                      <Text style={styles.menuBadgeText}>{unreadNotifications > 99 ? "99+" : unreadNotifications}</Text>
                    </View>
                  )}
                </View>
              </GestureDetector>

              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />

              <GestureDetector gesture={playerTapGesture}>
                <View style={styles.menuItem}>
                  <Ionicons name="musical-notes" size={18} color={colors.accent} />
                  <Text style={[styles.menuLabel, { color: colors.text }]}>Player</Text>
                </View>
              </GestureDetector>
            </View>
          </Animated.View>
        </GestureDetector>
      )}

      {/* Position-following container holds ONLY the ball now. `box-none` lets
          touches pass through the empty area; composedGesture is scoped to the
          ball so drag/tap never shadow the menu's GestureDetectors. */}
      <Animated.View
        style={[styles.widgetContainer, widgetAnimatedStyle]}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={composedGesture}>
          <View style={{ width: WIDGET_SIZE, height: WIDGET_SIZE }}>
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
          </View>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  widgetContainer: {
    position: "absolute",
    width: WIDGET_SIZE,
    height: WIDGET_SIZE,
    overflow: "visible",
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
  // Root-level wrapper whose top-left corner is placed by menuAnimatedStyle's
  // transform (widget position + above/right offset + measured size). High
  // elevation/zIndex keep it above the backdrop on Android.
  menuWrapper: {
    position: "absolute",
    left: 0,
    top: 0,
    elevation: 30,
    zIndex: 10000,
  },
  menu: {
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
