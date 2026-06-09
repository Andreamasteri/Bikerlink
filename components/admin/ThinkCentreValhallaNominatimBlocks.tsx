import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { ErrorHistory, ProbeLog, type ProbeLogEntry } from "./ThinkCentreCardParts";

export interface ValhallaDetailedHealth {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  tileVersion?: string;
  activeProfiles: string[];
  tokenMissing?: boolean;
  history: Array<{ timestamp: number; error: string }>;
  probeLog?: ProbeLogEntry[];
}

export interface NominatimDetailedHealth {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  dataUpdated?: string;
  softwareVersion?: string;
  dbState?: "ok" | "error" | "unknown";
  geocodeLatencyMs?: number | null;
  tokenMissing?: boolean;
  history: Array<{ timestamp: number; error: string }>;
  probeLog?: ProbeLogEntry[];
}

const PROFILE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  motorcycle: "motorbike",
  auto: "car",
  bicycle: "bicycle",
  pedestrian: "walk",
};

const PROFILE_LABELS: Record<string, string> = {
  motorcycle: "Moto",
  auto: "Auto",
  bicycle: "Bici",
  pedestrian: "Pedonale",
};

function formatDataUpdated(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return iso.slice(0, 10);
  }
}

export function ValhallaBlock({
  detail,
  fingerprint,
}: {
  detail: ValhallaDetailedHealth;
  fingerprint: string | null;
}) {
  const [open, setOpen] = useState(false);

  const statusColor = !detail.configured
    ? "#6b7280"
    : detail.ok
      ? "#22c55e"
      : "#ef4444";

  const statusLabel = !detail.configured
    ? "Non configurato"
    : detail.ok
      ? detail.latencyMs != null
        ? `Online · ${detail.latencyMs} ms`
        : "Online"
      : detail.error
        ? `Offline · ${detail.error}`
        : "Offline";

  const showFingerprint = detail.configured && fingerprint != null;
  const fpOk = showFingerprint && detail.ok;

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-valhalla-block-header"
      >
        <MaterialCommunityIcons name="routes" size={18} color={statusColor} style={styles.headerIcon} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Valhalla</Text>
          <Text style={styles.subtitle}>
            {detail.configured
              ? detail.ok
                ? `${detail.activeProfiles.length} profil${detail.activeProfiles.length === 1 ? "o" : "i"}${detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}`
                : "offline"
              : "non configurato"}
            {detail.url ? ` · ${detail.url}` : ""}
          </Text>
        </View>
        {detail.configured && (
          <Text style={styles.count}>
            {detail.ok ? `${detail.activeProfiles.length}/4` : "0/—"}
          </Text>
        )}
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusLabel}>{statusLabel}</Text>
          </View>

          {detail.tileVersion && (
            <Text style={styles.meta}>Tile: {detail.tileVersion}</Text>
          )}

          {detail.ok && detail.activeProfiles.length > 0 && (
            <View style={styles.profilesRow}>
              {detail.activeProfiles.map((p) => (
                <View key={p} style={styles.profileChip}>
                  <MaterialCommunityIcons
                    name={PROFILE_ICONS[p] ?? "routes"}
                    size={12}
                    color="#a78bfa"
                  />
                  <Text style={styles.profileChipText}>{PROFILE_LABELS[p] ?? p}</Text>
                </View>
              ))}
            </View>
          )}

          {detail.ok && detail.activeProfiles.length === 0 && (
            <Text style={styles.meta}>Nessun profilo rilevato</Text>
          )}

          {showFingerprint && (
            <View style={styles.fingerprintRow}>
              <Text style={styles.fingerprint} numberOfLines={1}>
                token Replit: {fingerprint}…
              </Text>
              {fpOk && (
                <Ionicons name="checkmark-circle" size={11} color="#22c55e" style={styles.tokenOkIcon} />
              )}
            </View>
          )}
          {detail.configured && !fingerprint && (
            <Text style={styles.fingerprint}>token Replit: non configurato</Text>
          )}

          {detail.configured && !detail.ok && detail.history?.length > 0 && (
            <ErrorHistory history={detail.history} />
          )}
          {detail.probeLog && detail.probeLog.length > 0 && (
            <ProbeLog entries={detail.probeLog} />
          )}
        </View>
      )}
    </View>
  );
}

export function NominatimBlock({
  detail,
  fingerprint,
}: {
  detail: NominatimDetailedHealth;
  fingerprint: string | null;
}) {
  const [open, setOpen] = useState(false);

  const statusColor = !detail.configured
    ? "#6b7280"
    : detail.ok
      ? "#22c55e"
      : "#ef4444";

  const statusLabel = !detail.configured
    ? "Pubblico (OSM)"
    : detail.ok
      ? detail.latencyMs != null
        ? `Online · ${detail.latencyMs} ms`
        : "Online"
      : detail.error
        ? `Offline · ${detail.error}`
        : "Offline";

  const showFingerprint = detail.configured && fingerprint != null;
  const fpOk = showFingerprint && detail.ok;

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-nominatim-block-header"
      >
        <MaterialCommunityIcons name="map-search-outline" size={18} color={statusColor} style={styles.headerIcon} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Nominatim</Text>
          <Text style={styles.subtitle}>
            {detail.configured ? "Self-hosted" : "Fallback pubblico"}
            {detail.ok && detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}
            {detail.ok && detail.dbState ? ` · DB ${detail.dbState}` : ""}
            {detail.url ? ` · ${detail.url}` : ""}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusLabel}>{statusLabel}</Text>
          </View>

          {(detail.dbState || detail.geocodeLatencyMs != null || detail.softwareVersion || detail.dataUpdated) && (
            <View style={styles.metaRow}>
              {detail.dbState && (
                <View style={[
                  styles.metaChip,
                  detail.dbState === "error" && styles.metaChipError,
                ]}>
                  <Ionicons
                    name={detail.dbState === "ok" ? "server-outline" : "alert-circle-outline"}
                    size={10}
                    color={detail.dbState === "ok" ? "#22c55e" : detail.dbState === "error" ? "#ef4444" : "#6b7280"}
                  />
                  <Text style={[
                    styles.metaText,
                    detail.dbState === "ok" && { color: "#22c55e" },
                    detail.dbState === "error" && { color: "#ef4444" },
                    detail.dbState === "unknown" && { color: "#6b7280" },
                  ]}>
                    DB {detail.dbState === "ok" ? "OK" : detail.dbState === "error" ? "Error" : "?"}
                  </Text>
                </View>
              )}
              {detail.geocodeLatencyMs != null && (
                <View style={styles.metaChip}>
                  <Ionicons name="location-outline" size={10} color="#60a5fa" />
                  <Text style={styles.metaText}>geocode {detail.geocodeLatencyMs} ms</Text>
                </View>
              )}
              {detail.softwareVersion && (
                <View style={styles.metaChip}>
                  <Ionicons name="code-outline" size={10} color="#60a5fa" />
                  <Text style={styles.metaText}>v{detail.softwareVersion}</Text>
                </View>
              )}
              {detail.dataUpdated && (
                <View style={styles.metaChip}>
                  <Ionicons name="time-outline" size={10} color="#60a5fa" />
                  <Text style={styles.metaText}>OSM {formatDataUpdated(detail.dataUpdated)}</Text>
                </View>
              )}
            </View>
          )}

          {!detail.configured && (
            <View style={styles.publicNote}>
              <Ionicons name="information-circle-outline" size={11} color="#f59e0b" />
              <Text style={styles.publicNoteText}>
                Nessun NOMINATIM_URL — usa il server pubblico (rate-limited)
              </Text>
            </View>
          )}

          {showFingerprint && (
            <View style={styles.fingerprintRow}>
              <Text style={styles.fingerprint} numberOfLines={1}>
                token Replit: {fingerprint}…
              </Text>
              {fpOk && (
                <Ionicons name="checkmark-circle" size={11} color="#22c55e" style={styles.tokenOkIcon} />
              )}
            </View>
          )}
          {detail.configured && !fingerprint && (
            <Text style={styles.fingerprint}>token Replit: non configurato</Text>
          )}

          {detail.configured && !detail.ok && detail.history?.length > 0 && (
            <ErrorHistory history={detail.history} />
          )}
          {detail.probeLog && detail.probeLog.length > 0 && (
            <ProbeLog entries={detail.probeLog} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    backgroundColor: "rgba(148, 163, 184, 0.04)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerIcon: { marginRight: 2 },
  headerText: { flex: 1 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  count: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary, letterSpacing: 0.3 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.12)",
    paddingTop: 8,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  meta: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary },
  profilesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(167, 139, 250, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.3)",
  },
  profileChipText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#a78bfa" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(96, 165, 250, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.2)",
  },
  metaChipError: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  metaText: { fontFamily: "Inter_500Medium", fontSize: 10, color: "#60a5fa" },
  publicNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 6,
    padding: 8,
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  publicNoteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#f59e0b",
    flex: 1,
    lineHeight: 14,
  },
  fingerprintRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  fingerprint: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#6b7280", letterSpacing: 0.2 },
  tokenOkIcon: { marginLeft: 1 },
});
