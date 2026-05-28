// Task #2657 — Timeline eventi AI (push da WS bridge) con filtri scope/severity.
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/useColors";

export interface TimelineEvent {
  id?: string;
  aiName: string;
  eventType: string;
  severity?: string;
  at?: string;
  correlationId?: string;
}

const KNOWN_AIS = ["all", "moderation", "watchdog", "ota-orchestrator", "db-integrity", "app-integrity", "console", "admin"] as const;
const SEVERITIES = ["all", "debug", "info", "warn", "critical"] as const;

export default function EventTimeline(props: { events: TimelineEvent[] }) {
  const colors = useColors();
  const [scope, setScope] = useState<(typeof KNOWN_AIS)[number]>("all");
  const [sev, setSev] = useState<(typeof SEVERITIES)[number]>("all");

  const filtered = useMemo(() => {
    return props.events.filter((e) => {
      if (scope !== "all" && e.aiName !== scope) return false;
      if (sev !== "all" && e.severity !== sev) return false;
      return true;
    });
  }, [props.events, scope, sev]);

  return (
    <View>
      <View style={styles.chips}>
        {KNOWN_AIS.map((a) => (
          <TouchableOpacity
            key={a}
            testID={`timeline-scope-${a}`}
            onPress={() => setScope(a)}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: scope === a ? colors.primary + "22" : "transparent" }]}
          >
            <Text style={{ color: colors.text, fontSize: 11 }}>{a}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.chips}>
        {SEVERITIES.map((s) => (
          <TouchableOpacity
            key={s}
            testID={`timeline-sev-${s}`}
            onPress={() => setSev(s)}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: sev === s ? colors.primary + "22" : "transparent" }]}
          >
            <Text style={{ color: colors.text, fontSize: 11 }}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginVertical: 6 }}>
        {filtered.length} / {props.events.length} eventi
      </Text>
      {filtered.length === 0 ? (
        <Text style={{ color: colors.textSecondary, padding: 12 }}>Nessun evento con questi filtri.</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e, i) => e.id ?? `${i}-${e.at ?? ""}`}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const tone =
              item.severity === "critical" ? colors.error :
              item.severity === "warn" ? colors.warning :
              colors.textSecondary;
            return (
              <View testID={`timeline-row-${item.aiName}-${item.eventType}`} style={[styles.row, { borderColor: colors.border }]}>
                <View style={[styles.dot, { backgroundColor: tone }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                    <Text style={{ fontWeight: "700" }}>{item.aiName}</Text> · {item.eventType}
                  </Text>
                  <Text style={[styles.meta, { color: colors.textSecondary }]}>
                    {item.at ? new Date(item.at).toLocaleTimeString("it-IT") : ""}{" "}
                    {item.correlationId ? `· ${item.correlationId.slice(0, 18)}` : ""}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  title: { fontSize: 13 },
  meta: { fontSize: 10, marginTop: 2 },
});
