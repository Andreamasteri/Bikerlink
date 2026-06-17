import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Constants from "expo-constants";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/lib/auth-context";
import { APPLIED_OTA_NUMBER, OTA_BUNDLED_COUNT } from "@/constants/buildInfo";
import { loadAppliedOtaNumber, saveAppliedOtaNumber } from "@/lib/otaStorage";

function parseAppVersion(): { apk: string; runtime: string; ota: string } {
  const version = Constants.expoConfig?.version ?? "";
  const parts = version.split(".");
  if (parts.length >= 3) {
    return { apk: parts[0], runtime: parts[1], ota: parts[2] };
  }
  if (parts.length === 2) {
    return { apk: parts[0], runtime: parts[1], ota: "—" };
  }
  return { apk: "—", runtime: "—", ota: "—" };
}

interface OtaReleaseSummary {
  status: string;
  otaVersion: string | null;
  publishedAt: string;
  message?: string | null;
}

export const ProfileVersionSection: React.FC = () => {
  const colors = useColors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [appliedOta, setAppliedOta] = useState<number | null>(APPLIED_OTA_NUMBER);

  useEffect(() => {
    const syncOtaNumber = async () => {
      try {
        const stored = await loadAppliedOtaNumber();
        const bundled = APPLIED_OTA_NUMBER;
        if (bundled !== null && (stored === null || bundled > stored)) {
          await saveAppliedOtaNumber(bundled);
          setAppliedOta(bundled);
        } else if (stored !== null) {
          setAppliedOta(stored);
        }
      } catch {
        // Fallback silenzioso: badge rimane al valore bundled
      }
    };
    syncOtaNumber();
  }, []);

  const { data: releases } = useQuery<OtaReleaseSummary[]>({
    queryKey: ["/api/admin/ota/releases"],
    enabled: isAdmin,
  });

  const lastApprovedOtaNum = useMemo(() => {
    if (!releases) return null;
    const approved = releases
      .filter((r) => r.status === "approved")
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    if (!approved.length) return null;
    const top = approved[0];
    const fromVersion = top.otaVersion?.match(/^\d+\.\d+\.(\d+)$/);
    if (fromVersion) return Number(fromVersion[1]);
    const fromMessage = top.message?.match(/^\[OTA:\d+\.\d+\.(\d+)\]/);
    if (fromMessage) return Number(fromMessage[1]);
    return null;
  }, [releases]);

  const { apk, runtime } = parseAppVersion();

  const displayOta = isAdmin && lastApprovedOtaNum !== null ? lastApprovedOtaNum : appliedOta;

  const showAdminOta =
    isAdmin &&
    APPLIED_OTA_NUMBER !== null &&
    lastApprovedOtaNum !== null &&
    APPLIED_OTA_NUMBER !== lastApprovedOtaNum;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.item}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Build</Text>
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            V{apk}.{runtime}.{OTA_BUNDLED_COUNT}
          </Text>
        </View>
        <Text style={[styles.dot, { color: colors.textSecondary }]}>·</Text>
        <View style={styles.item}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>OTA applicata</Text>
          <Text style={[styles.value, { color: colors.textSecondary }]}>
            {displayOta != null ? `#${displayOta}` : "—"}
          </Text>
        </View>
      </View>
      {showAdminOta && (
        <View style={styles.adminRow}>
          <Text style={[styles.adminLabel, { color: "#3B82F6" }]}>Admin OTA in test</Text>
          <Text style={[styles.adminValue, { color: "#3B82F6" }]}>#{APPLIED_OTA_NUMBER}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  item: {
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 1,
  },
  value: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  dot: {
    fontSize: 14,
    marginHorizontal: 2,
  },
  adminRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  adminLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  adminValue: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
