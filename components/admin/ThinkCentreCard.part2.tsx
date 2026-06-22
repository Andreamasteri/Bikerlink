import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./ThinkCentreCardStyles";
import { EventLog } from "./ThinkCentreCardParts";
import type { DotStatus } from "./SystemHealthContainer";

export function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <Ionicons
      name={collapsed ? "chevron-down" : "chevron-up"}
      size={18}
      color={Colors.textSecondary}
    />
  );
}

export function overallToStatus(overall: string): DotStatus {
  if (overall === "green") return "ok";
  if (overall === "yellow") return "degraded";
  if (overall === "red") return "offline";
  return "unknown";
}

export function serviceToStatus(s: any | undefined): DotStatus {
  if (!s || !s.configured) return "unknown";
  if (s.ok) return "ok";
  if (s.startingUp) return "degraded";
  return "offline";
}

export function ghToStatus(areas: any[], configured: boolean): DotStatus {
  if (!configured || areas.length === 0) return "unknown";
  const anyOk = areas.some((a: any) => a.ok);
  const allOk = areas.every((a: any) => a.ok);
  if (allOk) return "ok";
  if (anyOk) return "degraded";
  const anyStarting = areas.some((a: any) => a.enabled && a.startingUp);
  if (anyStarting) return "degraded";
  return "offline";
}

export function ufwToStatus(ufw: any | undefined): DotStatus {
  if (!ufw || !ufw.configured) return "unknown";
  return ufw.ok ? "ok" : "offline";
}

export function ThinkCentreFooter({
  poweredOffActive,
  data,
  isFetching,
  refetch,
  eventsData,
}: {
  poweredOffActive: boolean;
  data: any;
  isFetching: boolean;
  refetch: () => void;
  eventsData: any;
}) {
  if (poweredOffActive) {
    return (
      <View style={styles.poweredOffOverlay}>
        <Ionicons name="power-outline" size={22} color="#ef4444" />
        <Text style={styles.poweredOffOverlayTitle}>ThinkCentre spento</Text>
        <Text style={styles.poweredOffOverlaySub}>
          Override manuale attivo — tutti i servizi offline, probe e notifiche sospesi
        </Text>
      </View>
    );
  }

  return (
    <>
      {data && data.configuredCount > 0 && data.onlineCount < data.configuredCount && (
        <TouchableOpacity
          style={[styles.retryButton, isFetching && styles.retryButtonBusy]}
          onPress={() => { if (!isFetching) void refetch(); }}
          activeOpacity={isFetching ? 1 : 0.7}
          disabled={isFetching}
          testID="thinkcentre-retry-btn"
        >
          {isFetching ? (
            <ActivityIndicator size={12} color="#60a5fa" />
          ) : (
            <Ionicons name="refresh-outline" size={13} color="#60a5fa" />
          )}
          <Text style={styles.retryText}>
            {isFetching ? "Probe in corso…" : "Riprova ora"}
          </Text>
        </TouchableOpacity>
      )}

      {data && data.configuredCount > 0 && (
        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
          <View style={styles.noteBody}>
            <Text style={styles.noteText}>
              Il fingerprint del token Replit è sempre visibile per confronto preventivo — utile
              per verificare che una modifica ai secret sia stata applicata prima che scatti un 401.
              {data.onlineCount === 0
                ? "\nTutti i servizi risultano offline: verifica che il ThinkCentre sia acceso e il tunnel configurato."
                : ""}
              {"\n"}Per confronto lato server esegui{" "}
              <Text style={styles.mono}>check-token-fingerprints.sh</Text> sul ThinkCentre.
            </Text>
            <View style={styles.legend}>
              <Ionicons name="checkmark-circle" size={11} color="#22c55e" />
              <Text style={styles.legendText}>token OK — servizio online + fingerprint presente</Text>
            </View>
          </View>
        </View>
      )}

      {eventsData && eventsData.events.length > 0 && (
        <EventLog events={eventsData.events} />
      )}
    </>
  );
}

