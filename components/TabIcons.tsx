import React from "react";
import { View, type ColorValue } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface TabIconProps {
  name: string;
  focused: boolean;
  color: string | ColorValue;
  size: number;
  unreadCount?: number;
  globalTrackingActive?: boolean;
  globalSprintMeasuring?: boolean;
  hasActiveMatches?: boolean;
  statusIsAvailable?: boolean;
  isBikerOrCoppia?: boolean;
}

export function TabIcon({
  name,
  focused: _focused,
  color,
  size,
  unreadCount = 0,
  globalTrackingActive = false,
  globalSprintMeasuring = false,
  hasActiveMatches = false,
  statusIsAvailable = false,
  isBikerOrCoppia = false,
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
      return <Ionicons name="flash" size={size} color={color} />;

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
      return <Ionicons name="person" size={size} color={color} />;

    default:
      return null;
  }
}
