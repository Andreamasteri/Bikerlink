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
  cancellable,
  loadingLabel,
}: {
  label: string;
  icon: MCIconName;
  state: ActionState;
  onPress: () => void;
  color: string;
  cancellable?: boolean;
  loadingLabel?: string;
}) {
  const isLoading = state === "loading";
  const showCancel = isLoading && !!cancellable;
  const cancelColor = "#F44336";
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { borderColor: showCancel ? cancelColor : color },
        isLoading && !cancellable && styles.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={isLoading && !cancellable}
      activeOpacity={0.75}
    >
      {showCancel ? (
        <MaterialCommunityIcons name="close-circle-outline" size={15} color={cancelColor} />
      ) : isLoading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={15}
          color={state === "ok" ? "#4CAF50" : state === "error" ? "#F44336" : color}
        />
      )}
      <Text
        style={[
          styles.actionBtnText,
          { color: showCancel ? cancelColor : state === "ok" ? "#4CAF50" : state === "error" ? "#F44336" : color },
        ]}
      >
        {showCancel ? (loadingLabel ?? "Annulla") : label}
      </Text>
    </TouchableOpacity>
  );
}

export function AiProgressBar({
  batchIndex,
  totalBatches,
  totalKeysUpdated,
  summary,
}: {
  batchIndex: number;
  totalBatches: number;
  totalKeysUpdated: number;
  summary: Record<string, number>;
}) {
  const pct = totalBatches > 0 ? Math.min(100, Math.round((batchIndex / totalBatches) * 100)) : 0;
  const langOrder = ["en", "de", "es", "fr", "el", "tr"];
  const summaryStr = langOrder
    .filter((l) => (summary[l] ?? 0) > 0)
    .map((l) => `${l.toUpperCase()}: ${summary[l]}`)
    .join(", ");
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText} numberOfLines={2}>
        {`Batch ${batchIndex}/${totalBatches} completato, ${totalKeysUpdated} chiavi aggiornate`}
        {summaryStr ? ` (${summaryStr})` : ""}
      </Text>
    </View>
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
  progressContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 5,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border ?? "#2a2a2a",
    backgroundColor: "#9C27B012",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border ?? "#2a2a2a",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#9C27B0",
  },
  progressText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#9C27B0",
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
