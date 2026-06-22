import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useNewMatchAlert } from "@/hooks/useNewMatchAlert";

const MATCH_ROUTE = "/(tabs)/match" as Href;

export default function MatchPopupAlert() {
  const { visible, payload, dismiss } = useNewMatchAlert();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [thumbError, setThumbError] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 8 && gestureState.dy > 0,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 40) {
          Animated.timing(translateY, {
            toValue: 120,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            dismiss();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 200,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (visible) {
      setThumbError(false);
      translateY.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 180,
          friction: 8,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      timerRef.current = setTimeout(dismiss, 5000);
    } else {
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handlePress = () => {
    dismiss();
    router.push(MATCH_ROUTE);
  };

  const bottomOffset = insets.bottom + 80;

  const showThumbnail = !!(payload?.thumbnailUrl && !thumbError);
  const matchName = payload?.matchName ?? null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={visible ? "box-none" : "none"}
    >
      {visible && (
        <TouchableWithoutFeedback onPress={dismiss}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      )}

      <Animated.View
        style={[
          styles.container,
          {
            bottom: bottomOffset,
            opacity: opacityAnim,
            transform: [{ scale: scaleAnim }, { translateY }],
          },
        ]}
        pointerEvents={visible ? "auto" : "none"}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.accent }]}
          onPress={handlePress}
          activeOpacity={0.88}
        >
          {showThumbnail ? (
            <Image
              source={{ uri: payload!.thumbnailUrl }}
              style={styles.thumbnail}
              onError={() => setThumbError(true)}
            />
          ) : (
            <Text style={styles.flame}>🔥</Text>
          )}
          <View style={styles.textWrap}>
            {matchName ? (
              <>
                <Text style={styles.title} numberOfLines={1}>
                  {matchName}
                </Text>
                <Text style={styles.sub}>Hai un match! Tocca per vedere</Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Ehi, hai un match!</Text>
                <Text style={styles.sub}>Tocca per vedere chi è</Text>
              </>
            )}
          </View>
          <TouchableOpacity
            onPress={dismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.closeBtn}
          >
            <Text style={styles.closeX}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 10,
  },
  flame: {
    fontSize: 26,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  sub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  closeX: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    fontWeight: "600",
  },
});
