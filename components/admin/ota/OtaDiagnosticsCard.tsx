import React, { useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import Colors from "@/constants/colors";
import { OtaEventRow } from "./OtaDeviceHistoryCard";

interface OtaDiagnosticsCardProps {
  events: OtaEventRow[];
  formatTimestamp: (iso: string) => string;
}

export const OtaDiagnosticsCard: React.FC<OtaDiagnosticsCardProps> = ({
  events,
  formatTimestamp,
}) => {
  const [stackOpen, setStackOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const lastErrorEvent = useMemo(() => {
    const withDiag = events.find(
      (e) =>
        !!e.diagnostics &&
        e.phase !== "server-check" &&
        e.phase !== "server-anon-check",
    );
    if (withDiag) return withDiag;
    return (
      events.find(
        (e) =>
          !!e.error &&
          !e.error.startsWith("ok:") &&
          e.phase !== "server-check" &&
          e.phase !== "server-anon-check",
      ) ?? null
    );
  }, [events]);

  const handleCopy = useCallback(async () => {
    if (!lastErrorEvent) return;
    try {
      await Clipboard.setStringAsync(JSON.stringify(lastErrorEvent, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Errore", "Impossibile copiare negli appunti.");
    }
  }, [lastErrorEvent]);

  if (!lastErrorEvent) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="bug-outline" size={18} color={Colors.accent} />
          <Text style={styles.cardTitle}>Diagnostica OTA</Text>
        </View>
        <Text style={styles.hintText}>
          Nessun errore OTA recente. Quando il check fallisce, qui appariranno codice
          errore, stato di rete, esito del probe HTTP e stack nativo.
        </Text>
      </View>
    );
  }

  const diag = lastErrorEvent.diagnostics ?? {};
  const probe = diag.probe;
  const probeOk =
    probe && typeof probe.status === "number" && probe.status >= 200 && probe.status < 400;
  const probeColor = probe?.error ? "#FF4444" : probeOk ? "#44AA44" : "#FF8C00";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="bug-outline" size={18} color="#FF4444" />
        <Text style={[styles.cardTitle, { color: "#FF4444" }]}>Diagnostica OTA</Text>
        <TouchableOpacity
          onPress={handleCopy}
          style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons
            name={copied ? "checkmark-outline" : "copy-outline"}
            size={16}
            color={copied ? "#44AA44" : Colors.accent}
          />
          <Text style={{ color: copied ? "#44AA44" : Colors.accent, fontSize: 12 }}>
            {copied ? "Copiato" : "Copia"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.hintText, { fontSize: 11, marginBottom: 8 }]}>
        Ultimo errore: {formatTimestamp(lastErrorEvent.created_at)}
      </Text>

      {diag.errorCode ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>code</Text>
          <Text style={[diagStyles.value, { color: "#FF4444", fontWeight: "700" }]}>
            {diag.errorCode}
          </Text>
        </View>
      ) : null}

      <View style={diagStyles.row}>
        <Text style={diagStyles.label}>error</Text>
        <Text style={diagStyles.value} numberOfLines={3}>
          {lastErrorEvent.error}
        </Text>
      </View>

      {diag.errorCause ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>cause</Text>
          <Text style={diagStyles.value} numberOfLines={3}>
            {diag.errorCause}
          </Text>
        </View>
      ) : null}

      {diag.errorUserInfo ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>userInfo</Text>
          <Text style={diagStyles.value} numberOfLines={3}>
            {diag.errorUserInfo}
          </Text>
        </View>
      ) : null}

      {diag.channel ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>channel</Text>
          <Text style={diagStyles.value}>{diag.channel}</Text>
        </View>
      ) : null}

      {diag.networkInfo ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>network</Text>
          <Text style={diagStyles.value}>{diag.networkInfo}</Text>
        </View>
      ) : null}

      {diag.updateUrl ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>updateUrl</Text>
          <Text style={diagStyles.value} numberOfLines={2}>
            {diag.updateUrl}
          </Text>
        </View>
      ) : null}

      {probe ? (
        <View style={diagStyles.probeBox}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
          >
            <Ionicons
              name={probe.error ? "close-circle" : probeOk ? "checkmark-circle" : "alert-circle"}
              size={14}
              color={probeColor}
            />
            <Text style={{ color: probeColor, fontWeight: "700", fontSize: 12 }}>
              probe HTTP {probe.status ?? "—"}
              {typeof probe.durationMs === "number" ? ` · ${probe.durationMs}ms` : ""}
            </Text>
          </View>
          {probe.contentType ? (
            <Text style={diagStyles.probeMeta}>content-type: {probe.contentType}</Text>
          ) : null}
          {probe.error ? (
            <Text style={[diagStyles.probeMeta, { color: "#FF8888" }]}>
              err: {probe.error}
            </Text>
          ) : null}
          {probe.bodySnippet ? (
            <Text style={diagStyles.probeBody} numberOfLines={3}>
              {probe.bodySnippet || "(empty body)"}
            </Text>
          ) : null}
        </View>
      ) : null}

      {diag.nativeStack ? (
        <View style={{ marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => setStackOpen((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Ionicons
              name={stackOpen ? "chevron-down-outline" : "chevron-forward-outline"}
              size={14}
              color={Colors.textMuted ?? "#666"}
            />
            <Text style={{ color: Colors.textMuted ?? "#666", fontSize: 12 }}>
              nativeStack ({diag.nativeStack.length}c)
            </Text>
          </TouchableOpacity>
          {stackOpen ? (
            <Text style={diagStyles.stack} selectable>
              {diag.nativeStack}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const diagStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    gap: 8,
    alignItems: "flex-start",
  },
  label: {
    color: Colors.textMuted ?? "#666",
    fontSize: 11,
    width: 80,
    fontVariant: ["tabular-nums"],
  },
  value: {
    color: Colors.text,
    fontSize: 12,
    flex: 1,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  probeBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  probeMeta: {
    color: Colors.textMuted ?? "#666",
    fontSize: 11,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  probeBody: {
    color: Colors.text,
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  stack: {
    marginTop: 6,
    color: Colors.text,
    fontSize: 10,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 6,
    borderRadius: 4,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
});
