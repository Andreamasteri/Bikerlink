import React, { type ComponentProps } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type MCIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export type ActionState = "idle" | "loading" | "ok" | "error";

export function ActionButton({
  label,
  icon,
  state,
  onPress,
  color,
}: {
  label: string;
  icon: MCIconName;
  state: ActionState;
  onPress: () => void;
  color: string;
}) {
  const isLoading = state === "loading";
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: color }, isLoading && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.75}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={15}
          color={state === "ok" ? "#4CAF50" : state === "error" ? "#F44336" : color}
        />
      )}
      <Text style={[styles.actionBtnText, { color: state === "ok" ? "#4CAF50" : state === "error" ? "#F44336" : color }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ActionResultBanner({
  msg,
  state,
  onDismiss,
}: {
  msg: string;
  state: ActionState;
  onDismiss: () => void;
}) {
  const isOk = state === "ok";
  return (
    <TouchableOpacity
      style={[styles.resultBanner, isOk ? styles.resultBannerOk : styles.resultBannerErr]}
      onPress={onDismiss}
      activeOpacity={0.8}
    >
      <MaterialCommunityIcons
        name={isOk ? "check-circle-outline" : "alert-circle-outline"}
        size={14}
        color={isOk ? "#4CAF50" : "#F44336"}
      />
      <Text style={[styles.resultBannerText, { color: isOk ? "#4CAF50" : "#F44336" }]} numberOfLines={2}>
        {msg}
      </Text>
      <MaterialIcons name="close" size={14} color={isOk ? "#4CAF50" : "#F44336"} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 4,
  },
  actionBtnDisabled: { opacity: 0.55 },
  actionBtnText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  resultBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
  },
  resultBannerOk: { backgroundColor: "#4CAF5012" },
  resultBannerErr: { backgroundColor: "#F4433612" },
  resultBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
