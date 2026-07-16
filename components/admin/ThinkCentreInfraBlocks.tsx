import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { ErrorHistory, ProbeLog } from "./ThinkCentreCardParts";
import type { ProbeLogEntry } from "./ThinkCentreCardParts";

// Task #165 — stato del modello Ollama configurato per ogni persona AI.
export interface PersonaModelStatus {
  configured: string;
  /** true/false = presente/assente su Ollama; null = lista modelli non disponibile. */
  available: boolean | null;
}

export type PersonaModels = {
  bowie: PersonaModelStatus;
  horus: PersonaModelStatus;
  ares: PersonaModelStatus;
  quebracho: PersonaModelStatus;
};

const PERSONA_LABELS: Array<{ key: keyof PersonaModels; label: string }> = [
  { key: "bowie", label: "Bowie" },
  { key: "horus", label: "Horus" },
  { key: "ares", label: "Ares" },
  { key: "quebracho", label: "Quebracho" },
];

function PersonaModelRows({ personaModels }: { personaModels: PersonaModels }) {
  return (
    <View style={styles.personaSection}>
      <Text style={styles.personaTitle}>Modelli per persona</Text>
      {PERSONA_LABELS.map(({ key, label }) => {
        const pm = personaModels[key];
        if (!pm) return null;
        const color = pm.available == null ? "#6b7280" : pm.available ? "#22c55e" : "#ef4444";
        const badge = pm.available == null ? "sconosciuto" : pm.available ? "disponibile" : "mancante";
        return (
          <View key={key}>
            <View style={styles.personaRow}>
              <Text style={styles.personaName}>{label}</Text>
              <Text style={styles.personaModel} numberOfLines={1}>{pm.configured}</Text>
              <View style={[styles.personaBadge, { borderColor: color }]}>
                <View style={[styles.personaDot, { backgroundColor: color }]} />
                <Text style={[styles.personaBadgeText, { color }]}>{badge}</Text>
              </View>
            </View>
            {pm.available === false && (
              <Text style={styles.personaWarning}>
                Modello {pm.configured} non trovato su Ollama — {label} non funzionerà
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

export interface SimpleServiceHealth {
  configured: boolean;
  ok: boolean;
  startingUp?: boolean;
  latencyMs: number | null;
  url: string | null;
  error?: string;
  history: Array<{ timestamp: number; error: string }>;
  probeLog?: ProbeLogEntry[];
}

interface InfraBlockProps {
  serviceKey: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  service?: SimpleServiceHealth;
  fingerprint?: string | null;
  configNote?: string;
  isLoading?: boolean;
  hasError?: boolean;
  /** Task #165 — contenuto extra renderizzato nel body espanso (es. modelli per persona). */
  extraBody?: React.ReactNode;
}

function InfraBlock({
  label,
  icon,
  service,
  fingerprint,
  configNote,
  isLoading,
  hasError,
  extraBody,
}: InfraBlockProps) {
  const [open, setOpen] = useState(false);

  const startingUp = service != null && service.configured && !service.ok && !!service.startingUp;

  const statusColor =
    service == null
      ? hasError
        ? "#ef4444"
        : "#6b7280"
      : !service.configured
        ? "#6b7280"
        : service.ok
          ? "#22c55e"
          : startingUp
            ? "#f59e0b"
            : "#ef4444";

  const subtitleText =
    service == null
      ? isLoading
        ? "…"
        : hasError
          ? "Errore connessione"
          : "…"
      : service.configured
        ? service.ok
          ? `Online${service.latencyMs != null ? ` · ${service.latencyMs} ms` : ""}${service.url ? ` · ${service.url}` : ""}`
          : startingUp
            ? "avvio in corso…"
            : "offline"
        : "non configurato";

  const statusLabel =
    service == null
      ? isLoading
        ? "…"
        : hasError
          ? "Errore connessione"
          : "…"
      : !service.configured
        ? "Non configurato"
        : service.ok
          ? `Online${service.latencyMs != null ? ` · ${service.latencyMs} ms` : ""}`
          : startingUp
            ? "Avvio in corso — timeout ripetuti senza successo recente"
            : service.error
              ? `Offline · ${service.error}`
              : "Offline";

  const showFingerprint = service != null && service.configured && fingerprint != null;
  const fpOk = showFingerprint && service != null && service.ok;

  return (
    <View style={styles.block}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name={icon} size={18} color={statusColor} style={styles.headerIcon} />
        <View style={styles.headerText}>
          <Text style={styles.title}>{label}</Text>
          <Text style={[styles.subtitle, hasError && service == null && styles.subtitleError]}>
            {subtitleText}
          </Text>
        </View>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      {open && (
        <View style={styles.body}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusLabel, hasError && service == null && styles.statusLabelError]}>
              {statusLabel}
            </Text>
          </View>

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
          {service != null && service.configured && fingerprint === null && (
            <Text style={styles.fingerprint}>token Replit: non configurato</Text>
          )}

          {service != null && !service.configured && configNote && (
            <View style={styles.configNote}>
              <Ionicons name="information-circle-outline" size={11} color="#f59e0b" />
              <Text style={styles.configNoteText}>{configNote}</Text>
            </View>
          )}

          {service != null && service.configured && !service.ok && (service.history?.length ?? 0) > 0 && (
            <ErrorHistory history={service.history} />
          )}
          {service != null && service.probeLog && service.probeLog.length > 0 && (
            <ProbeLog entries={service.probeLog} />
          )}
          {extraBody}
        </View>
      )}
    </View>
  );
}

// ── Named exports ─────────────────────────────────────────────────────────────

export function OllamaBlock({
  service,
  fingerprint,
  personaModels,
  isLoading,
  hasError,
}: { service?: SimpleServiceHealth; fingerprint?: string | null; personaModels?: PersonaModels | null; isLoading?: boolean; hasError?: boolean }) {
  return (
    <InfraBlock
      serviceKey="ollama"
      label="Ollama AI"
      icon="robot-outline"
      service={service}
      fingerprint={fingerprint}
      configNote="Aggiungere OLLAMA_URL e OLLAMA_TOKEN nei secret Replit."
      isLoading={isLoading}
      hasError={hasError}
      extraBody={personaModels ? <PersonaModelRows personaModels={personaModels} /> : null}
    />
  );
}

export function WhisperBlock({
  service,
  fingerprint,
  isLoading,
  hasError,
}: { service?: SimpleServiceHealth; fingerprint?: string | null; isLoading?: boolean; hasError?: boolean }) {
  return (
    <InfraBlock
      serviceKey="whisper"
      label="Whisper ASR"
      icon="microphone-outline"
      service={service}
      fingerprint={fingerprint}
      configNote="Aggiungere WHISPER_URL (porta host: 8080) e WHISPER_TOKEN nei secret Replit."
      isLoading={isLoading}
      hasError={hasError}
    />
  );
}

export function DragonflyBlock({
  service,
  isLoading,
  hasError,
}: { service?: SimpleServiceHealth; isLoading?: boolean; hasError?: boolean }) {
  return (
    <InfraBlock
      serviceKey="dragonfly"
      label="DragonflyDB"
      icon="database-outline"
      service={service}
      configNote="Aggiungere DRAGONFLY_PROBE_HOST (e DRAGONFLY_PROBE_PORT se diversa da 6379) nei secret Replit." // pragma: allowlist secret
      isLoading={isLoading}
      hasError={hasError}
    />
  );
}

export function NginxBlock({
  service,
  isLoading,
  hasError,
}: { service?: SimpleServiceHealth; isLoading?: boolean; hasError?: boolean }) {
  return (
    <InfraBlock
      serviceKey="nginx"
      label="nginx"
      icon="server-network-outline"
      service={service}
      configNote="Aggiungere NGINX_MONITOR_URL (es. http://192.168.1.35:80) nei secret Replit."
      isLoading={isLoading}
      hasError={hasError}
    />
  );
}

export function UptimeKumaBlock({
  service,
  isLoading,
  hasError,
}: { service?: SimpleServiceHealth; isLoading?: boolean; hasError?: boolean }) {
  return (
    <InfraBlock
      serviceKey="uptimekuma"
      label="Uptime Kuma"
      icon="chart-line"
      service={service}
      configNote="Aggiungere UPTIME_KUMA_URL (es. http://127.0.0.1:3001) nei secret Replit. Avviare con: docker compose up -d uptime-kuma"
      isLoading={isLoading}
      hasError={hasError}
    />
  );
}

export function AiHubBlock({
  service,
  isLoading,
  hasError,
}: { service?: SimpleServiceHealth; isLoading?: boolean; hasError?: boolean }) {
  return (
    <InfraBlock
      serviceKey="aihub"
      label="AI Hub"
      icon="brain"
      service={service}
      configNote="Aggiungere AI_HUB_URL e AI_HUB_GATE_TOKEN nei secret Replit. Il servizio gira su pm2 porta 4405 sul ThinkCentre." // pragma: allowlist secret
      isLoading={isLoading}
      hasError={hasError}
    />
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  personaSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(148, 163, 184, 0.14)",
  },
  personaTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  personaRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 3,
    gap: 6,
  },
  personaName: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.text,
    width: 74,
  },
  personaModel: {
    flex: 1,
    fontSize: 10,
    color: Colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  personaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  personaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  personaBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  personaWarning: {
    fontSize: 10,
    color: "#ef4444",
    marginLeft: 74,
    marginBottom: 2,
  },
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
  subtitleError: { color: "#ef4444" },
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
  statusLabelError: { color: "#ef4444" },
  fingerprintRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  fingerprint: { fontFamily: "Inter_400Regular", fontSize: 9, color: "#6b7280", letterSpacing: 0.2 },
  tokenOkIcon: { marginLeft: 1 },
  configNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    padding: 8,
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  configNoteText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#f59e0b",
    flex: 1,
    lineHeight: 14,
  },
});
