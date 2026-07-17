import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { ErrorHistory, ProbeLog, type ProbeLogEntry } from "./ThinkCentreCardParts";

export interface UfwDetailedHealth {
  configured: boolean;
  ok: boolean;
  status: "active" | "inactive" | "error" | "unreachable";
  latencyMs: number | null;
  url: string | null;
  ruleCount?: number;
  error?: string;
  history: Array<{ timestamp: number; error: string }>;
  probeLog?: ProbeLogEntry[];
}

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

export interface PhotonDetailedHealth {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
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

export function ValhallaBlock({
  detail,
  fingerprint,
  isLoading,
  hasError,
}: {
  detail: ValhallaDetailedHealth | null;
  fingerprint: string | null;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const statusColor = detail == null
    ? (hasError ? "#ef4444" : "#6b7280")
    : !detail.configured
      ? "#6b7280"
      : detail.ok
        ? "#22c55e"
        : "#ef4444";

  const subtitleText = detail == null
    ? (isLoading ? "…" : hasError ? "Errore connessione" : "…")
    : detail.configured
      ? detail.ok
        ? `${detail.activeProfiles.length} profil${detail.activeProfiles.length === 1 ? "o" : "i"}${detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}`
        : "offline"
      : "non configurato";

  const statusLabel = detail == null
    ? (isLoading ? "…" : hasError ? "Errore connessione" : "…")
    : !detail.configured
      ? "Non configurato"
      : detail.ok
        ? detail.latencyMs != null
          ? `Online · ${detail.latencyMs} ms`
          : "Online"
        : detail.error
          ? `Offline · ${detail.error}`
          : "Offline";

  const showFingerprint = detail != null && detail.configured && fingerprint != null;
  const fpOk = showFingerprint && detail != null && detail.ok;

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
          <Text style={[styles.subtitle, hasError && detail == null && styles.subtitleError]}>
            {subtitleText}
            {detail?.url ? ` · ${detail.url}` : ""}
          </Text>
        </View>
        {detail != null && detail.configured && (
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
            <Text style={[styles.statusLabel, hasError && detail == null && styles.statusLabelError]}>
              {statusLabel}
            </Text>
          </View>

          {detail != null && detail.tileVersion && (
            <Text style={styles.meta}>Tile: {detail.tileVersion}</Text>
          )}

          {detail != null && detail.ok && detail.activeProfiles.length > 0 && (
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

          {detail != null && detail.ok && detail.activeProfiles.length === 0 && (
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
          {detail != null && detail.configured && !fingerprint && (
            <Text style={styles.fingerprint}>token Replit: non configurato</Text>
          )}

          {detail != null && detail.configured && !detail.ok && detail.history?.length > 0 && (
            <ErrorHistory history={detail.history} />
          )}
          {detail != null && detail.probeLog && detail.probeLog.length > 0 && (
            <ProbeLog entries={detail.probeLog} />
          )}
        </View>
      )}
    </View>
  );
}

export function PhotonBlock({
  detail,
  fingerprint,
  isLoading,
  hasError,
}: {
  detail: PhotonDetailedHealth | null;
  fingerprint: string | null;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const statusColor = detail == null
    ? (hasError ? "#ef4444" : "#6b7280")
    : !detail.configured
      ? "#6b7280"
      : detail.ok
        ? "#22c55e"
        : "#ef4444";

  const subtitleText = detail == null
    ? (isLoading ? "…" : hasError ? "Errore connessione" : "…")
    : detail.configured
      ? `Self-hosted${detail.ok && detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}`
      : "Non configurato";

  const statusLabel = detail == null
    ? (isLoading ? "…" : hasError ? "Errore connessione" : "…")
    : !detail.configured
      ? "Non configurato"
      : detail.ok
        ? detail.latencyMs != null
          ? `Online · ${detail.latencyMs} ms`
          : "Online"
        : detail.error
          ? `Offline · ${detail.error}`
          : "Offline";

  const showFingerprint = detail != null && detail.configured && fingerprint != null;
  const fpOk = showFingerprint && detail != null && detail.ok;

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-photon-block-header"
      >
        <MaterialCommunityIcons name="map-search-outline" size={18} color={statusColor} style={styles.headerIcon} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Photon</Text>
          <Text style={[styles.subtitle, hasError && detail == null && styles.subtitleError]}>
            {subtitleText}
            {detail?.url ? ` · ${detail.url}` : ""}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, hasError && detail == null && styles.statusLabelError]}>
              {statusLabel}
            </Text>
          </View>

          {detail != null && !detail.configured && (
            <View style={styles.publicNote}>
              <Ionicons name="information-circle-outline" size={11} color="#f59e0b" />
              <Text style={styles.publicNoteText}>
                Nessun PHOTON_URL — geocoding disabilitato (nessun fallback pubblico)
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
          {detail != null && detail.configured && !fingerprint && (
            <Text style={styles.fingerprint}>token Replit: non configurato</Text>
          )}

          {detail != null && detail.configured && !detail.ok && detail.history?.length > 0 && (
            <ErrorHistory history={detail.history} />
          )}
          {detail != null && detail.probeLog && detail.probeLog.length > 0 && (
            <ProbeLog entries={detail.probeLog} />
          )}
        </View>
      )}
    </View>
  );
}

export function UfwBlock({
  detail,
  isLoading,
  hasError,
}: {
  detail: UfwDetailedHealth | null;
  isLoading?: boolean;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const statusColor =
    detail == null
      ? hasError
        ? "#ef4444"
        : "#6b7280"
      : !detail.configured
        ? "#6b7280"
        : detail.ok
          ? "#22c55e"
          : detail.status === "inactive"
            ? "#ef4444"
            : "#6b7280";

  const subtitleText =
    detail == null
      ? isLoading
        ? "…"
        : hasError
          ? "Errore connessione"
          : "…"
      : detail.configured
        ? detail.ok
          ? `active${detail.ruleCount != null ? ` · ${detail.ruleCount} regole` : ""}${detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}`
          : detail.status
        : "non configurato";

  const statusLabel =
    detail == null
      ? isLoading
        ? "…"
        : hasError
          ? "Errore connessione"
          : "…"
      : !detail.configured
        ? "Non configurato (UFW_STATUS_URL mancante)"
        : detail.ok
          ? `Firewall attivo${detail.latencyMs != null ? ` · ${detail.latencyMs} ms` : ""}`
          : detail.error
            ? `${detail.status} · ${detail.error}`
            : detail.status;

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-ufw-block-header"
      >
        <MaterialCommunityIcons
          name={detail?.ok ? "shield-check-outline" : "shield-off-outline"}
          size={18}
          color={statusColor}
          style={styles.headerIcon}
        />
        <View style={styles.headerText}>
          <Text style={styles.title}>Firewall (ufw)</Text>
          <Text style={[styles.subtitle, hasError && detail == null && styles.subtitleError]}>
            {subtitleText}
            {detail?.url ? ` · ${detail.url}` : ""}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, hasError && detail == null && styles.statusLabelError]}>
              {statusLabel}
            </Text>
          </View>

          {detail != null && detail.configured && detail.ruleCount != null && (
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <MaterialCommunityIcons name="shield-check-outline" size={10} color="#60a5fa" />
                <Text style={styles.metaText}>{detail.ruleCount} regole attive</Text>
              </View>
            </View>
          )}

          {detail != null && !detail.configured && (
            <View style={styles.publicNote}>
              <Ionicons name="information-circle-outline" size={11} color="#f59e0b" />
              <Text style={styles.publicNoteText}>
                Nessun UFW_STATUS_URL — aggiungere il secret Replit dopo aver eseguito{" "}
                setup-ufw-thinkcentre.sh sul ThinkCentre.
              </Text>
            </View>
          )}

          {detail != null && detail.configured && !detail.ok && detail.history?.length > 0 && (
            <ErrorHistory history={detail.history} />
          )}
          {detail != null && detail.probeLog && detail.probeLog.length > 0 && (
            <ProbeLog entries={detail.probeLog} />
          )}
        </View>
      )}
    </View>
  );
}

export interface AreaResolverDetail {
  ok: boolean;
  severity: string;
  reason: string | null;
  sqlCode: string | null;
}

export function AreaResolverBlock({ detail }: { detail: AreaResolverDetail }) {
  const [open, setOpen] = useState(false);
  // Only "warn" severity is currently emitted, but guard for future escalation.
  const statusColor = detail.severity === "critical" ? "#ef4444" : detail.severity === "high" ? "#f97316" : "#f59e0b";

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        testID="thinkcentre-area-resolver-block-header"
      >
        <MaterialCommunityIcons name="database-alert-outline" size={18} color={statusColor} style={styles.headerIcon} />
        <View style={styles.headerText}>
          <Text style={styles.title}>Area resolver</Text>
          <Text style={[styles.subtitle, { color: statusColor }]}>
            {detail.sqlCode ? `Errore SQL · ${detail.sqlCode}` : "Errore SQL"}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, { color: statusColor }]}>
              {detail.sqlCode ? `Errore SQL (SQLSTATE ${detail.sqlCode})` : "Errore SQL nell'area resolver"}
            </Text>
          </View>
          {detail.reason ? (
            <Text style={styles.meta} numberOfLines={4}>{detail.reason}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

import { styles } from "./ThinkCentreValhallaPhotonBlocks.styles";
