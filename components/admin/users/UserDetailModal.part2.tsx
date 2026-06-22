import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { statsStyles, privacyStyles } from "./UserDetailModal.parts";

export interface PrivacyLogEntry { newValue: boolean; changedAt: string }
export interface PrivacyOverview {
  currentSettings: Record<string, boolean | number | string>;
  log: Record<string, PrivacyLogEntry[]>;
}

const PRIVACY_SETTINGS: Array<{ key: string; label: string; paramKey?: string; paramLabel?: string }> = [
  { key: "ghost_mode", label: "Ghost Mode" },
  { key: "hide_from_map", label: "Non visibile sulla mappa" },
  { key: "position_fuzz", label: "Altera Posizione", paramKey: "position_fuzz_km", paramLabel: "km" },
  { key: "fixed_position_enabled", label: "Posizione Fissa" },
  { key: "fake_home_enabled", label: "Fake Home" },
  { key: "fake_work_enabled", label: "Fake Work" },
  { key: "fake_whatever_enabled", label: "Fake Whatever" },
  { key: "offline_position_randomize", label: "Randomizza offline" },
  { key: "continuous_gps", label: "GPS Continuo" },
];

function formatTimelineDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
  const month = months[d.getMonth()];
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${month} alle ${h}:${m}`;
}

export function PrivacySection({ userId }: { userId: string }) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, isError } = useQuery<PrivacyOverview>({
    queryKey: ["/api/admin/users", userId, "privacy-overview"],
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${userId}/privacy-overview`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento dati privacy");
      return res.json();
    },
    enabled: expanded,
    staleTime: 30000,
  });

  return (
    <View style={statsStyles.section}>
      <TouchableOpacity style={privacyStyles.collapseHeader} onPress={() => setExpanded((v) => !v)}>
        <Text style={statsStyles.sectionTitle}>Privacy &amp; Posizione</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.accent} />
      </TouchableOpacity>

      {expanded && (
        <>
          {isLoading && <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 4 }}>Caricamento...</Text>}
          {isError && <Text style={{ color: Colors.error, fontSize: 13, marginTop: 4 }}>Errore caricamento dati privacy</Text>}
          {data && PRIVACY_SETTINGS.map(({ key, label, paramKey, paramLabel }) => {
            const val = data.currentSettings[key] as boolean;
            const param = paramKey ? data.currentSettings[paramKey] : undefined;
            const entries = (data.log[key] ?? []).slice(0, 5);
            return (
              <View key={key} style={privacyStyles.settingRow}>
                <View style={privacyStyles.settingTop}>
                  <Text style={privacyStyles.settingName}>{label}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {param !== undefined && <Text style={privacyStyles.badgeParam}>{param}{paramLabel}</Text>}
                    <View style={val ? privacyStyles.badgeOn : privacyStyles.badgeOff}>
                      <Text style={[privacyStyles.badgeText, { color: val ? Colors.success : Colors.textSecondary }]}>
                        {val ? "ON" : "OFF"}
                      </Text>
                    </View>
                  </View>
                </View>
                {entries.length === 0 ? (
                  <Text style={privacyStyles.noEvents}>Nessuna modifica recente</Text>
                ) : (
                  entries.map((e, i) => (
                    <View key={i} style={privacyStyles.timelineItem}>
                      <Ionicons
                        name={e.newValue ? "radio-button-on" : "radio-button-off"}
                        size={12}
                        color={e.newValue ? Colors.success : Colors.textSecondary}
                      />
                      <Text style={privacyStyles.timelineText}>
                        {e.newValue ? "Attivata" : "Disattivata"} il {formatTimelineDate(e.changedAt)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}
