import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  TouchableOpacity,
  Pressable,
  Dimensions,

} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFloatingWidget } from "@/lib/floating-widget-context";
import { useTheme } from "@/lib/theme-context";

const WIDGET_SIZE = 48;
const POSITION_KEY = "floating_widget_position";
const TAP_THRESHOLD = 5;

export default function FloatingWidget() {
  const { isVisible, unreadChat, unreadNotifications } = useFloatingWidget();
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
        } catch {
          // no-op: fallback to default position if JSON is malformed
        }
      }
      setPositionLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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


  if (!isVisible || !positionLoaded) return null;

  const totalUnread = unreadChat + unreadNotifications;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
