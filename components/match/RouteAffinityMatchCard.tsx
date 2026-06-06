import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

interface TopPlace {
  cell: string;
  label: string;
  lat: number;
  lon: number;
  weight?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- match shape varies
type MatchShape = any;

interface Props {
  match: MatchShape;
  currentUserId: string;
  onAccept: () => void;
  onReject: () => void;
  onChatPress?: () => void;
  onRemove?: () => void;
  isPending: boolean;
  t: (key: string) => string;
  locale: string;
  // Task #3393 — "telemetry" riusa questa card per i match per stile di guida.
  variant?: "route" | "telemetry";
}

export function RouteAffinityMatchCard({
  match,
  currentUserId,
  onAccept,
  onReject,
  onChatPress,
  onRemove,
  isPending,
  t,
  locale,
  variant = "route",
}: Props) {
  const router = useRouter();
  const isTelemetry = variant === "telemetry";
  const otherUserId: string = match.otherUserId ?? (match.userAId === currentUserId ? match.userBId : match.userAId);
  const otherNickname: string = match.otherNickname ?? (match.userAId === currentUserId ? match.userBNickname : match.userANickname) ?? "—";
  const topPlaces: TopPlace[] = isTelemetry || !Array.isArray(match.topPlaces) ? [] : match.topPlaces;
  const isNew = match.status === "new";
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";
  const scorePct = Math.round(((isTelemetry ? match.combinedScore : match.score) ?? 0) * 100);

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : Colors.accent;
  const baseLabel = isTelemetry ? t("match.telemetryAffinityLabel") : t("match.routeAffinityLabel");
  const statusLabel = isAccepted ? t("match.accepted") : isRejected ? t("match.rejected") : baseLabel;
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted
    ? "checkmark-circle"
    : isRejected
      ? "close-circle"
      : isTelemetry ? "speedometer" : "map";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const commonText = isTelemetry
    ? `${scorePct}% ${t("match.telemetryAffinityLabel")}`
    : t("match.commonCellsCount").replace("{count}", String(match.commonCells ?? 0)) + ` · ${scorePct}%`;

  return (
    <View style={[styles.card, isRejected && styles.dimmed]}>
      <View style={styles.statusRow}>
        <Ionicons name={statusIcon} size={16} color={statusColor} />
        <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        {createdDate && <Text style={styles.date}>{createdDate}</Text>}
        {isAccepted && onRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={16} color={Colors.accentRed} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.userRow}
        activeOpacity={0.7}
        onPress={() => otherUserId && router.push(`/profile/${otherUserId}` as never)}
      >
        <Ionicons name="bicycle" size={24} color={Colors.maleIcon} />
        <View style={{ flex: 1 }}>
          <Text style={styles.nickname}>{otherNickname}</Text>
          <Text style={styles.subText}>{commonText}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {topPlaces.length > 0 && (
        <View style={styles.placesBlock}>
          <Text style={styles.placesTitle}>{t("match.commonPlaces")}</Text>
          {topPlaces.slice(0, 3).map((p) => (
            <View key={p.cell} style={styles.placeRow}>
              <Ionicons name="location" size={12} color={Colors.accent} />
              <Text style={styles.placeText} numberOfLines={1}>
                {p.label && p.label.trim().length > 0
                  ? p.label
                  : `${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}`}
              </Text>
            </View>
          ))}
        </View>
      )}

      {isAccepted && onChatPress && (
        <TouchableOpacity style={styles.chatBtn} onPress={onChatPress}>
          <Ionicons name="chatbubble" size={18} color={Colors.background} />
          <Text style={styles.chatBtnText}>{t("match.sendMessage")}</Text>
        </TouchableOpacity>
      )}

      {isNew && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={onReject}
            disabled={isPending}
          >
            <Ionicons name="close" size={20} color={Colors.accentRed} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.acceptBtn]}
            onPress={onAccept}
            disabled={isPending}
          >
            <Ionicons name="checkmark" size={20} color={Colors.background} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 6,
    gap: 8,
  },
  dimmed: { opacity: 0.55 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  date: { fontSize: 11, color: Colors.textSecondary },
  userRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nickname: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.maleIcon },
  subText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  placesBlock: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  placesTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 2 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  placeText: { fontSize: 13, color: Colors.text, flex: 1 },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 10,
  },
  chatBtnText: { color: Colors.background, fontFamily: "Inter_600SemiBold" },
  actionsRow: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  actionBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center",
  },
  rejectBtn: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.accentRed },
  acceptBtn: { backgroundColor: Colors.accent },
});
