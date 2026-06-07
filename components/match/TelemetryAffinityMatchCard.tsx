import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

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
}

export function TelemetryAffinityMatchCard({
  match,
  currentUserId,
  onAccept,
  onReject,
  onChatPress,
  onRemove,
  isPending,
  t,
  locale,
}: Props) {
  const router = useRouter();
  const otherUserId: string = match.otherUserId ?? (match.userAId === currentUserId ? match.userBId : match.userAId);
  const otherNickname: string = match.otherNickname ?? (match.userAId === currentUserId ? match.userBNickname : match.userANickname) ?? "—";
  const isNew = match.status === "new";
  const isAccepted = match.status === "accepted";
  const isRejected = match.status === "rejected";
  const scorePct = Math.round((match.combinedScore ?? 0) * 100);

  const styleLabels: string[] = Array.isArray(match.styleLabels) ? match.styleLabels : [];

  const statusColor = isAccepted ? Colors.success : isRejected ? Colors.accentRed : Colors.accent;
  const statusLabel = isAccepted
    ? t("match.accepted")
    : isRejected
      ? t("match.rejected")
      : t("match.telemetryAffinityLabel");
  const statusIcon: keyof typeof Ionicons.glyphMap = isAccepted
    ? "checkmark-circle"
    : isRejected
      ? "close-circle"
      : "speedometer";

  const createdDate = match.createdAt
    ? new Date(match.createdAt).toLocaleDateString(locale, {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;

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
        <Ionicons name="speedometer" size={24} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.nickname}>{otherNickname}</Text>
          <Text style={styles.subText}>{`${scorePct}% ${t("match.telemetryAffinityLabel")}`}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {styleLabels.length > 0 && (
        <View style={styles.labelsBlock}>
          <Text style={styles.labelsTitle}>{t("match.telemetryStyleTitle")}</Text>
          <View style={styles.chipsRow}>
            {styleLabels.map((label) => {
              const key = `match.styleLabel.${label}`;
              const translated = t(key);
              const display = translated !== key ? translated : label;
              return (
                <View key={label} style={styles.chip}>
                  <Text style={styles.chipText}>{display}</Text>
                </View>
              );
            })}
          </View>
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
  nickname: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text },
  subText: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  labelsBlock: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  labelsTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: Colors.accent + "22",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.accent + "44",
  },
  chipText: { fontSize: 12, color: Colors.accent, fontFamily: "Inter_500Medium" },
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
