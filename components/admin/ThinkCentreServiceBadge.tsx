import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

export interface ServiceHealthMini {
  key: string;
  configured: boolean;
  ok: boolean;
  startingUp?: boolean;
}

export interface ThinkCentreHealthMini {
  services: ServiceHealthMini[];
  graphhopperConfigured: boolean;
  graphhopperAreas: { enabled: boolean; ok: boolean; startingUp?: boolean }[];
  ufwDetail?: { configured: boolean; ok: boolean };
}

function svcColor(s: ServiceHealthMini | undefined): string {
  if (!s || !s.configured) return "#6b7280";
  if (s.ok) return "#22c55e";
  if (s.startingUp) return "#f59e0b";
  return "#ef4444";
}

function ghBadgeColor(data: ThinkCentreHealthMini): string {
  if (!data.graphhopperConfigured || data.graphhopperAreas.length === 0) return "#6b7280";
  const enabled = data.graphhopperAreas.filter((a) => a.enabled);
  if (enabled.length === 0) return "#6b7280";
  const online = enabled.filter((a) => a.ok).length;
  if (online === enabled.length) return "#22c55e";
  if (online === 0) return enabled.some((a) => a.startingUp) ? "#f59e0b" : "#ef4444";
  return "#f59e0b";
}

function ufwBadgeColor(data: ThinkCentreHealthMini): string {
  const ufw = data.ufwDetail;
  if (!ufw || !ufw.configured) return "#6b7280";
  return ufw.ok ? "#22c55e" : "#ef4444";
}

type BadgeItem = { name: string; color: string };
type BadgeGroup = { label: string; items: BadgeItem[] };

export function ServiceBadgeStrip({ data }: { data: ThinkCentreHealthMini }) {
  const find = (key: string) => data.services.find((s) => s.key === key);
  const groups: BadgeGroup[] = [
    {
      label: "Routing",
      items: [
        { name: "GH", color: ghBadgeColor(data) },
        { name: "Valhalla", color: svcColor(find("valhalla")) },
        { name: "Nominatim", color: svcColor(find("nominatim")) },
      ],
    },
    {
      label: "AI",
      items: [
        { name: "Ollama", color: svcColor(find("ollama")) },
        { name: "Whisper", color: svcColor(find("whisper")) },
      ],
    },
    {
      label: "Infra",
      items: [
        { name: "Redis", color: svcColor(find("redis")) },
        { name: "Postgres", color: svcColor(find("postgres")) },
        { name: "pgAdmin", color: svcColor(find("pgadmin")) },
        { name: "nginx", color: svcColor(find("nginx")) },
        { name: "Kuma", color: svcColor(find("uptimekuma")) },
      ],
    },
    {
      label: "Sicurezza",
      items: [{ name: "UFW", color: ufwBadgeColor(data) }],
    },
  ];
  return (
    <View style={styles.strip}>
      {groups.map((g) => (
        <View key={g.label} style={styles.group}>
          <Text style={styles.groupLabel}>{g.label}</Text>
          <View style={styles.badges}>
            {g.items.map((item) => (
              <View key={item.name} style={[styles.badge, { borderColor: item.color + "33" }]}>
                <View style={[styles.dot, { backgroundColor: item.color }]} />
                <Text style={[styles.badgeText, { color: item.color }]}>{item.name}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  group: { flexDirection: "row", alignItems: "center", gap: 6 },
  groupLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#6b7280",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    minWidth: 52,
  },
  badges: { flexDirection: "row", gap: 4, flexWrap: "wrap", flex: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(148,163,184,0.06)",
    borderWidth: 1,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.2 },
});
