import React, { useState } from "react";
import { View, Text, TouchableOpacity, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import s from "./diagnostica-styles";
import { TabRadiografia } from "./diagnostica-pipeline";
import { TabMonitor } from "./diagnostica-monitor";
import { TabDevice } from "./diagnostica-device";
import { adminFetch } from "./diagnostica-types";
import type { PipelineRunResult } from "./diagnostica-types";

type Tab = "radiografia" | "monitor" | "device";

export default function DiagnosticaScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("radiografia");
  const [activeHoles, setActiveHoles] = useState(0);

  const { data: lastData } = useQuery<{ result: PipelineRunResult | null; inProgress: boolean }>({
    queryKey: ["/api/admin/pipeline-check/last"],
    queryFn: async () => {
      const r = await adminFetch("/api/admin/pipeline-check/last");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    staleTime: 30_000,
  });

  const telemetryPipeline = lastData?.result?.pipelines.find(p => p.pipeline === "telemetry_ride") ?? null;
  const telemetryDotColor = telemetryPipeline
    ? (telemetryPipeline.overall === "ok" ? "#22c55e" : "#ef4444")
    : null;

  const tabBarTop = Platform.OS === "web" ? insets.top + 67 : insets.top;

  return (
    <View style={[s.root, { paddingTop: tabBarTop }]}>
      {/* Tab bar */}
      <View style={s.tabBar}>
        {(["radiografia", "monitor", "device"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabItem, activeTab === tab && s.tabItemActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.75}
          >
            <View>
              {tab === "radiografia" && (
                <View>
                  <MaterialCommunityIcons
                    name="stethoscope"
                    size={20}
                    color={activeTab === tab ? Colors.accent : Colors.textSecondary}
                  />
                  {telemetryDotColor !== null && (
                    <View style={[s.tabDot, { backgroundColor: telemetryDotColor }]} />
                  )}
                </View>
              )}
              {tab === "monitor" && (
                <View>
                  <MaterialCommunityIcons
                    name="pulse"
                    size={20}
                    color={activeTab === tab ? Colors.accent : Colors.textSecondary}
                  />
                  {activeHoles > 0 && (
                    <View style={s.tabBadge}>
                      <Text style={s.tabBadgeText}>{activeHoles > 9 ? "9+" : activeHoles}</Text>
                    </View>
                  )}
                </View>
              )}
              {tab === "device" && (
                <MaterialCommunityIcons
                  name="devices"
                  size={20}
                  color={activeTab === tab ? Colors.accent : Colors.textSecondary}
                />
              )}
            </View>
            <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>
              {tab === "radiografia" ? "Radiografia" : tab === "monitor" ? "Monitor" : "Device"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Live Dashboard link */}
      <TouchableOpacity
        style={s.liveDashboardBtn}
        onPress={() => {
          const url = new URL("/admin/diagnostics/live", getApiUrl()).toString();
          Linking.openURL(url);
        }}
        activeOpacity={0.75}
      >
        <Ionicons name="desktop-outline" size={13} color={Colors.accent} />
        <Text style={s.liveDashboardBtnText}>Live Dashboard (PC)</Text>
        <Ionicons name="open-outline" size={11} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Content */}
      <View style={[s.tabContent2, { paddingBottom: insets.bottom + 20 }]}>
        {activeTab === "radiografia" && <TabRadiografia />}
        {activeTab === "monitor" && <TabMonitor onActiveCount={setActiveHoles} />}
        {activeTab === "device" && <TabDevice />}
      </View>
    </View>
  );
}
