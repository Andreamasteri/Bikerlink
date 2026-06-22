/**
 * Task #2824 — Health Sistema Routing.
 *
 * Stato di salute per ogni engine/componente del routing: GraphHopper
 * (self-hosted), Cloud fallback, Valhalla e tiles. Pull-to-refresh manuale.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { RoutingCloudBanner } from "@/components/admin/RoutingCloudBanner";
import type { RoutingStatus } from "@/components/admin/routing-control/types";
import { copyLogToClipboard } from "@/lib/copyAdminLog";

function statusColor(ok: boolean | null, down: boolean): string {
  if (down) return Colors.error;
  if (ok) return Colors.success;
  return Colors.textSecondary;
}

function formatDate(ms: number | null): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function MotorcycleProfileBadge({ available }: { available: boolean | null | undefined }) {
  if (available === null || available === undefined) return null;
  const ok = available === true;
  const color = ok ? Colors.success : Colors.warning;
  const label = ok ? "Profilo OK" : "⚠ Profilo mancante";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color, marginLeft: 6 }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function EngineCard({
  title,
  icon,
  color,
  statusLabel,
  rows,
  motorcycleProfileAvailable,
}: {
  title: string;
  icon: string;
  color: string;
  statusLabel: string;
  rows: { label: string; value: string }[];
  motorcycleProfileAvailable?: boolean | null;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <MaterialCommunityIcons name={icon as never} size={22} color={color} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <View style={styles.cardHeaderBadges}>
          {motorcycleProfileAvailable !== undefined && (
            <MotorcycleProfileBadge available={motorcycleProfileAvailable} />
          )}
          <View style={[styles.badge, { backgroundColor: color + "22", borderColor: color }]}>
            <Text style={[styles.badgeText, { color }]}>{statusLabel}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardBody}>
        {rows.map((r) => (
          <View key={r.label} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Text style={styles.rowValue}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function RoutingHealthScreen() {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery<RoutingStatus>({
    queryKey: ["/api/admin/routing/status"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const gh = data?.graphhopper;
  const valhalla = data?.valhalla;
  const cloud = data?.cloudFallback;
  const tiles = data?.tiles;
  const env = data?.envConfig;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.overallCard}>
        <View style={styles.overallLeft}>
          <MaterialCommunityIcons
            name="heart-pulse"
            size={32}
            color={data?.killSwitch.enabled ? Colors.success : Colors.error}
          />
          <View style={{ marginLeft: 14 }}>
            <Text style={styles.overallLabel}>Routing Health</Text>
            <Text
              style={[
                styles.overallStatus,
                { color: data?.killSwitch.enabled ? Colors.success : Colors.error },
              ]}
            >
              {isLoading ? "…" : data?.killSwitch.enabled ? "ATTIVO" : "DISABILITATO"}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {data && (
            <TouchableOpacity
              onPress={async () => {
                const extraLines: string[] = [
                  `Routing: ${data.killSwitch.enabled ? "ATTIVO" : "DISABILITATO"}`,
                  `Engine attivo: ${data.activeEngine}`,
                  `Rollout: ${data.rollout}`,
                  "",
                  `GraphHopper: ${gh?.down ? "DOWN" : gh?.ok ? "OK" : "—"} · Latenza: ${gh?.latencyMs != null ? `${gh.latencyMs}ms` : "—"} · Fallimenti: ${gh?.consecutiveFailures ?? 0}`,
                  `Cloud Fallback: ${cloud?.active ? "ATTIVO" : cloud?.available ? "PRONTO" : "N/D"}`,
                  `Valhalla: ${!valhalla?.configured ? "N/D" : valhalla?.down ? "DOWN" : valhalla?.ok ? "OK" : "—"}`,
                  `Tiles: ${tiles?.selfHosted ? "SELF-HOSTED" : "ESTERNI"}`,
                  ...(gh?.error ? [`Errore GH: ${gh.error}`] : []),
                ];
                const ok = await copyLogToClipboard({
                  title: "Routing Health",
                  extraLines,
                });
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.copyBtn}
            >
              <MaterialIcons name="content-copy" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.runButton, (isLoading || isFetching) && styles.runButtonDisabled]}
            onPress={() => refetch()}
            activeOpacity={0.7}
            disabled={isLoading || isFetching}
          >
            {isLoading || isFetching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                <Text style={styles.runButtonText}>Aggiorna</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
      {copied && (
        <Text style={styles.copiedHint}>Copiato!</Text>
      )}

      {data && gh?.down && cloud?.active && (
        <RoutingCloudBanner />
      )}

      {data && (
        <>
          <EngineCard
            title="GraphHopper (self-hosted)"
            icon="server"
            color={
              gh?.down && cloud?.active
                ? Colors.warning
                : statusColor(gh?.ok ?? null, gh?.down ?? false)
            }
            statusLabel={
              gh?.down && cloud?.active
                ? "DOWN → CLOUD"
                : gh?.down ? "DOWN" : gh?.ok ? "OK" : "—"
            }
            motorcycleProfileAvailable={gh?.selfHosted ? (gh?.motorcycleProfileAvailable ?? null) : undefined}
            rows={[
              { label: "URL", value: gh?.url || "—" },
              { label: "Self-hosted", value: gh?.selfHosted ? "Sì" : "No" },
              { label: "Stato", value: gh?.status ?? "—" },
              { label: "Latenza", value: gh?.latencyMs != null ? `${gh.latencyMs} ms` : "—" },
              { label: "Ultimo check", value: formatDate(gh?.lastCheckAt ?? null) },
              { label: "Fallimenti consec.", value: String(gh?.consecutiveFailures ?? 0) },
              ...(gh?.down && cloud?.active
                ? [{ label: "Copertura", value: "Cloud fallback attivo (profilo car)" }]
                : []),
              ...(gh?.error ? [{ label: "Errore", value: gh.error }] : []),
            ]}
          />

          <EngineCard
            title="Cloud Fallback"
            icon="cloud-outline"
            color={cloud?.active ? Colors.warning : cloud?.available ? Colors.success : Colors.textSecondary}
            statusLabel={cloud?.active ? "ATTIVO" : cloud?.available ? "PRONTO" : "N/D"}
            rows={[
              { label: "Disponibile", value: cloud?.available ? "Sì" : "No" },
              { label: "In uso ora", value: cloud?.active ? "Sì (profilo car)" : "No" },
            ]}
          />

          <EngineCard
            title="Valhalla"
            icon="map-marker-distance"
            color={
              !valhalla?.configured
                ? Colors.textSecondary
                : statusColor(valhalla?.ok ?? null, valhalla?.down ?? false)
            }
            statusLabel={
              !valhalla?.configured ? "N/D" : valhalla?.down ? "DOWN" : valhalla?.ok ? "OK" : "—"
            }
            rows={[
              { label: "Configurato", value: valhalla?.configured ? "Sì" : "No" },
              { label: "Stato", value: valhalla?.status ?? "—" },
              ...(valhalla?.version ? [{ label: "Versione", value: valhalla.version }] : []),
            ]}
          />

          <EngineCard
            title="Tiles"
            icon="grid"
            color={tiles?.selfHosted ? Colors.success : Colors.textSecondary}
            statusLabel={tiles?.selfHosted ? "SELF-HOSTED" : "ESTERNI"}
            rows={[
              { label: "Self-hosted", value: tiles?.selfHosted ? "Sì" : "No" },
              { label: "URL", value: tiles?.url || "—" },
            ]}
          />

          <EngineCard
            title="Env vars configurate"
            icon="key-variant"
            color={env?.graphhopperUrl || env?.graphhopperApiKey ? Colors.success : Colors.warning}
            statusLabel={env?.graphhopperUrl || env?.graphhopperApiKey ? "OK" : "INCOMPLETE"}
            rows={[
              { label: "GRAPHHOPPER_URL", value: env?.graphhopperUrl ? "Presente" : "Assente" },
              { label: "GRAPHHOPPER_TOKEN", value: env?.graphhopperToken ? "Presente" : "Assente" },
              { label: "GRAPHHOPPER_API_KEY", value: env?.graphhopperApiKey ? "Presente" : "Assente" },
            ]}
          />

          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.infoText}>
              Engine attivo: {data.activeEngine} · Rollout: {data.rollout}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 12 },
  overallCard: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 18,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderColor: Colors.border,
  },
  overallLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  overallLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  overallStatus: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 2 },
  runButton: {
    flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.accent,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  runButtonDisabled: { opacity: 0.6 },
  runButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: Colors.border, overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14,
  },
  cardHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  cardHeaderBadges: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  badge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  cardBody: { borderTopWidth: 1, borderTopColor: Colors.border, padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  rowValue: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, flexShrink: 1, textAlign: "right" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 4 },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textTransform: "capitalize" },
  copyBtn: { padding: 4 },
  copiedHint: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.success, textAlign: "center" },
});
