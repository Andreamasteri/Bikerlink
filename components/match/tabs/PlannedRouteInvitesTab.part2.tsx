import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

export interface PlannedRouteInvite {
  id: string;
  routeId: string;
  ownerId: string;
  ownerNickname: string;
  ownerAvatarUrl: string | null;
  routeTitle: string;
  routeDistanceKm: number;
  routeDurationMinutes: number;
  routeStyle: string;
  score: number;
  reasons: Record<string, unknown>;
  priority: string;
  status: string;
  createdAt: string;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function ScoreDots({ score }: { score: number }) {
  const colors = useColors();
  const filled = Math.round(score * 5);
  return (
    <View style={styles.scoreDots}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i <= filled ? colors.accent : colors.border },
          ]}
        />
      ))}
    </View>
  );
}

type Colors = ReturnType<typeof useColors>;

export function ReasonsRow({ reasons, colors }: { reasons: Record<string, unknown>; colors: Colors }) {
  const chips: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [];

  const geoOverlap = typeof reasons.geoOverlap === "number" ? reasons.geoOverlap : 0;
  const commonCells = typeof reasons.commonCells === "number" ? reasons.commonCells : 0;
  const curvyBonus = typeof reasons.curvyBonus === "number" ? reasons.curvyBonus : 0;

  if (geoOverlap > 0) {
    chips.push({ label: `${Math.round(geoOverlap * 100)}% zone simili`, icon: "map-outline" });
  }
  if (commonCells > 0) {
    chips.push({ label: `${commonCells} celle GPS`, icon: "grid-outline" });
  }
  if (curvyBonus > 0) {
    chips.push({ label: "stile curvy compatibile", icon: "sync-outline" });
  }
  if (reasons.source === "manual") {
    chips.push({ label: "invito diretto", icon: "person-add-outline" });
  }

  if (chips.length === 0) return null;

  return (
    <View style={[reasonStyles.row, { borderTopColor: colors.border }]}>
      {chips.map((chip, i) => (
        <View key={i} style={[reasonStyles.chip, { backgroundColor: colors.background }]}>
          <Ionicons name={chip.icon} size={11} color={colors.textSecondary} />
          <Text style={[reasonStyles.chipText, { color: colors.textSecondary }]}>{chip.label}</Text>
        </View>
      ))}
    </View>
  );
}

const reasonStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 2,
    borderTopWidth: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});

export function InviteCard({
  invite,
  onAccept,
  onReject,
  onViewRoute,
  accepting,
  rejecting,
}: {
  invite: PlannedRouteInvite;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onViewRoute: (routeId: string) => void;
  accepting: boolean;
  rejecting: boolean;
}) {
  const colors = useColors();
  const t = useT();

  const styleKey = `match.giriStyleLabel.${invite.routeStyle}` as Parameters<typeof t>[0];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {invite.priority === "high" && (
        <View style={[styles.highBadge, { backgroundColor: colors.accent }]}>
          <Ionicons name="star" size={10} color="#fff" />
          <Text style={styles.highBadgeText}>Top match</Text>
        </View>
      )}

      <TouchableOpacity style={styles.routeHeader} onPress={() => onViewRoute(invite.routeId)} activeOpacity={0.7}>
        <View style={styles.routeTitleRow}>
          <Ionicons name="map-outline" size={16} color={colors.accent} />
          <Text style={[styles.routeTitle, { color: colors.text }]} numberOfLines={2}>
            {invite.routeTitle}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
        </View>

        <View style={styles.routeMeta}>
          <View style={styles.metaChip}>
            <Ionicons name="navigate-outline" size={12} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {invite.routeDistanceKm.toFixed(0)} km
            </Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={12} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>
              {formatDuration(invite.routeDurationMinutes)}
            </Text>
          </View>
          <View style={[styles.styleChip, { backgroundColor: colors.accent + "18" }]}>
            <Text style={[styles.styleChipText, { color: colors.accent }]}>
              {t(styleKey) || invite.routeStyle}
            </Text>
          </View>
        </View>
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: colors.border } ]} />

      <View style={styles.ownerRow}>
        {invite.ownerAvatarUrl ? (
          <Image source={{ uri: invite.ownerAvatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.accent + "30" }]}>
            <Ionicons name="person" size={16} color={colors.accent} />
          </View>
        )}
        <View style={styles.ownerInfo}>
          <Text style={[styles.ownerLabel, { color: colors.textSecondary }]}>
            {t("match.giriOwnerLabel")}
          </Text>
          <Text style={[styles.ownerNickname, { color: colors.text }]}>
            {invite.ownerNickname}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
            {t("match.giriScoreLabel")}
          </Text>
          <ScoreDots score={invite.score} />
          <Text style={[styles.scorePercent, { color: colors.accent }]}>
            {Math.round(invite.score * 100)}%
          </Text>
        </View>
      </View>

      <ReasonsRow reasons={invite.reasons} colors={colors} />

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.rejectBtn, { borderColor: colors.border }]}
          onPress={() => onReject(invite.id)}
          disabled={rejecting || accepting}
        >
          {rejecting ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={[styles.rejectText, { color: colors.textSecondary }]}>
              {t("match.giriReject")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.acceptBtn, { backgroundColor: colors.accent }]}
          onPress={() => onAccept(invite.id)}
          disabled={accepting || rejecting}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="chatbubble-outline" size={15} color="#fff" />
              <Text style={styles.acceptText}>{t("match.giriAccept")}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  highBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    zIndex: 1,
  },
  highBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  routeHeader: {
    padding: 14,
    gap: 8,
  },
  routeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingRight: 60,
  },
  routeTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  routeMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  styleChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  styleChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  divider: {
    height: 1,
    marginHorizontal: 14,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  ownerInfo: {
    flex: 1,
    gap: 1,
  },
  ownerLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  ownerNickname: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  scoreBlock: {
    alignItems: "flex-end",
    gap: 2,
  },
  scoreLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  scoreDots: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scorePercent: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  rejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
  },
  acceptText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
