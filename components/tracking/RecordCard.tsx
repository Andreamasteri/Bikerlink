import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useT } from "@/lib/language-context";
import { useUnits } from "@/lib/units-context";
import { formatDistance, formatSpeed } from "@/lib/units";
import { getCurrentLocale } from "@/lib/i18n";
import Colors from "@/constants/colors";
import { convertSpeed, speedUnitLabel, formatHMS } from "./tracking-utils";

export interface RouteRecord {
  id: string;
  title?: string | null;
  totalDistanceKm?: number;
  maxSpeedKmh?: number;
  avgSpeedKmh?: number;
  maxAltitude?: number;
  durationSeconds?: number;
  idleTimeSeconds?: number;
  status: string;
  createdAt: string;
  maxAccelerationG?: number | null;
  isSprint?: boolean;
  sprint0to100Ms?: number | null;
  gpsBlackoutCount?: number | null;
  gpsBlackoutSeconds?: number | null;
}

interface RecordCardProps {
  item: RouteRecord;
  onPublish: () => void;
  onDelete: () => void;
  onViewRoute: () => void;
  onExportGpx: () => void;
}

export function RecordCard({
  item,
  onPublish,
  onDelete,
  onViewRoute,
  onExportGpx,
}: RecordCardProps) {
  const t = useT();
  const { speedUnit, distanceUnit, timeFormat } = useUnits();
  const dur = item.durationSeconds || 0;
  const locale = getCurrentLocale();
  return (
    <View
      style={[
        styles.recordCard,
        item.isSprint && { borderColor: Colors.accentRed, borderWidth: 1.5 },
      ]}
    >
      <View style={styles.recordHeader}>
        <Ionicons
          name={item.isSprint ? "speedometer" : "flag"}
          size={16}
          color={item.isSprint ? Colors.accentRed : Colors.accent}
        />
        {item.isSprint && (
          <View style={styles.sprintBadge}>
            <Text style={styles.sprintBadgeText}>0-100</Text>
          </View>
        )}
        <Text style={[styles.recordDate, { flex: 1 }]}>
          {new Date(item.createdAt).toLocaleDateString(locale, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: timeFormat === "12h",
          })}
        </Text>
        <TouchableOpacity onPress={onViewRoute} style={[styles.publishIconBtn, { backgroundColor: Colors.accent + "18", marginRight: 6, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 }]} activeOpacity={0.7}>
          <Ionicons name="map-outline" size={16} color={Colors.accent} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent }}>{t("tracking.route")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onExportGpx} style={[styles.publishIconBtn, { backgroundColor: Colors.accent + "18", marginRight: 6, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 }]} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={16} color={Colors.accent} />
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.accent }}>{t("tracking.exportGpx")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPublish} style={styles.publishIconBtn} activeOpacity={0.7}>
          <Ionicons name="share-outline" size={18} color={Colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDelete}
          style={[styles.publishIconBtn, { backgroundColor: Colors.accentRed + "15", marginLeft: 6 }]}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.accentRed} />
        </TouchableOpacity>
      </View>
      {item.isSprint ? (
        <View style={styles.recordRow}>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {item.sprint0to100Ms != null ? (item.sprint0to100Ms / 1000).toFixed(2) + "s" : "—"}
            </Text>
            <Text style={styles.recordStatLabel}>0→{convertSpeed(100, speedUnit).toFixed(0)} {speedUnitLabel(speedUnit)}</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {formatSpeed(item.maxSpeedKmh || 0, speedUnit, 0)}
            </Text>
            <Text style={styles.recordStatLabel}>vel. max</Text>
          </View>
          {item.maxAccelerationG != null && (
            <View style={styles.recordStat}>
              <Text style={styles.recordStatValue}>{item.maxAccelerationG.toFixed(2)}G</Text>
              <Text style={styles.recordStatLabel}>accel. max</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.recordRow}>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {formatDistance(item.totalDistanceKm || 0, distanceUnit, 2)}
            </Text>
            <Text style={styles.recordStatLabel}>{t("tracking.distance")}</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>{formatHMS(dur * 1000)}</Text>
            <Text style={styles.recordStatLabel}>{t("tracking.duration")}</Text>
          </View>
          <View style={styles.recordStat}>
            <Text style={styles.recordStatValue}>
              {formatSpeed(item.maxSpeedKmh || 0, speedUnit, 0)}
            </Text>
            <Text style={styles.recordStatLabel}>{t("tracking.maxSpeed")}</Text>
          </View>
        </View>
      )}
      {!item.isSprint && (item.gpsBlackoutCount ?? 0) > 0 && (
        <View style={styles.gpsBlackoutRow}>
          <Ionicons name="warning-outline" size={13} color={Colors.textSecondary} />
          <Text style={styles.gpsBlackoutText}>
            {`${t("tracking.gpsBlackoutLabel")}: ${item.gpsBlackoutCount} ${t("tracking.gpsBlackoutTimes")} (${item.gpsBlackoutSeconds ?? 0} s ${t("tracking.gpsBlackoutTotal")})`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  recordCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recordHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  recordDate: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginLeft: 8,
  },
  recordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  recordStat: {
    flex: 1,
  },
  recordStatValue: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  recordStatLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  publishIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  sprintBadge: {
    backgroundColor: Colors.accentRed,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
    marginRight: 4,
  },
  sprintBadgeText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  gpsBlackoutRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  gpsBlackoutText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
