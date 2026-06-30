import React, { useEffect, useRef } from "react";
import { View, Text, type ColorValue } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

interface TabIconProps {
  name: string;
  focused: boolean;
  color: string | ColorValue;
  size: number;
  unreadCount?: number;
  newMatchCount?: number;
  globalTrackingActive?: boolean;
  globalSprintMeasuring?: boolean;
  hasActiveMatches?: boolean;
  statusIsAvailable?: boolean;
  isBikerOrCoppia?: boolean;
  showCalibrationBadge?: boolean;
}

function MatchBadge({
  count,
  backgroundColor,
}: {
  count: number;
  backgroundColor: string;
}) {
  const scale = useSharedValue(count > 0 ? 1 : 0);
  const prevCount = useRef(count);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      prevCount.current = count;
      return;
    }
    if (count > prevCount.current) {
      scale.value = 0;
      scale.value = withSpring(1, {
        damping: 6,
        stiffness: 280,
        overshootClamping: false,
      });
    } else if (count === 0) {
      scale.value = 0;
    }
    prevCount.current = count;
  }, [count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (count <= 0) return null;

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: -4,
          right: -6,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 2,
        },
        animatedStyle,
      ]}
    >
      <Text
        style={{
          color: "#fff",
          fontSize: 9,
          fontFamily: "Inter_700Bold",
          lineHeight: 12,
        }}
      >
        {count > 99 ? "99+" : String(count)}
      </Text>
    </Animated.View>
  );
}

export function TabIcon({
  name,
  color,
  size,
  unreadCount = 0,
  newMatchCount = 0,
  globalTrackingActive = false,
  globalSprintMeasuring = false,
  hasActiveMatches = false,
  statusIsAvailable = false,
  isBikerOrCoppia = false,
  showCalibrationBadge = false,
}: TabIconProps) {
  const colors = useColors();

  switch (name) {
    case "index":
      return <Ionicons name="map" size={size} color={color} />;
    
    case "proposals":
      return (
        <MaterialCommunityIcons
          name="motorbike"
          size={22}
          color={
            globalTrackingActive || globalSprintMeasuring || hasActiveMatches
              ? "#f97316"
              : color
          }
        />
      );

    case "ready":
      return (
        <Ionicons
          name="location"
          size={22}
          color={statusIsAvailable ? colors.success : colors.accentRed}
        />
      );

    case "motoclub":
      return <Ionicons name="shield" size={size} color={color} />;

    case "eventi":
      return <Ionicons name="calendar" size={size} color={color} />;

    case "match":
      return (
        <View>
          <Ionicons name="flash" size={size} color={color} />
          <MatchBadge count={newMatchCount} backgroundColor={colors.accent} />
        </View>
      );

    case "music":
      return <Ionicons name="musical-notes-outline" size={size} color={color} />;

    case "chat":
      return (
        <View>
          <Ionicons name="chatbubbles" size={size} color={color} />
          {unreadCount > 0 && (
            <View
              style={{
                position: "absolute",
                top: -2,
                right: -4,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: colors.accent,
              }}
            />
          )}
        </View>
      );

    case "contest":
      return <Ionicons name="camera" size={size} color={color} />;

    case "arcade":
      return <Ionicons name="game-controller" size={size} color={color} />;

    case "bowie":
      return <MaterialCommunityIcons name="cat" size={size} color={color} />;

    case "ride":
      return null;

    case "giri":
      return <MaterialCommunityIcons name="map-marker-path" size={size} color={color} />;

    case "tracking":
      return <Ionicons name="navigate" size={size} color={color} />;

    case "garage":
      return isBikerOrCoppia ? (
        <MaterialCommunityIcons name="motorbike" size={size} color={color} />
      ) : (
        <Ionicons name="heart" size={size} color={color} />
      );

    case "profile":
      return (
        <View>
          <Ionicons name="person" size={size} color={color} />
          {showCalibrationBadge && (
            <View
              style={{
                position: "absolute",
                top: -3,
                right: -5,
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: "#e67e22",
                borderWidth: 1.5,
                borderColor: "#fff",
              }}
            />
          )}
        </View>
      );

    default:
      return null;
  }
}
