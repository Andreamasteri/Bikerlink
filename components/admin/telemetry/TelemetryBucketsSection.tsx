import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal, FlatList, Pressable,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { SparklineChart, BucketsData } from "./TelemetrySparkline";

function adminFetch(path: string): Promise<Response> {
  return fetch(new URL(path, getApiUrl()).toString(), {
    headers: authFetchHeaders(),
    credentials: "include",
  }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  });
}

const EVENT_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Tutti gli eventi", value: "" },
  { label: "map_init", value: "map_init" },
  { label: "map_init_failed", value: "map_init_failed" },
  { label: "map_ready", value: "map_ready" },
  { label: "map_destroy", value: "map_destroy" },
  { label: "webview_crash", value: "webview_crash" },
  { label: "render_slow", value: "render_slow" },
  { label: "render_frame", value: "render_frame" },
  { label: "tile_load_error", value: "tile_load_error" },
  { label: "tile_load_ok", value: "tile_load_ok" },
  { label: "style_load_error", value: "style_load_error" },
  { label: "gps_acquire", value: "gps_acquire" },
  { label: "gps_lost", value: "gps_lost" },
  { label: "gps_degraded", value: "gps_degraded" },
  { label: "gps_low_accuracy", value: "gps_low_accuracy" },
  { label: "routing_request", value: "routing_request" },
  { label: "routing_success", value: "routing_success" },
  { label: "routing_failed", value: "routing_failed" },
  { label: "routing_fallback", value: "routing_fallback" },
  { label: "matching_request", value: "matching_request" },
  { label: "matching_success", value: "matching_success" },
  { label: "matching_failed", value: "matching_failed" },
  { label: "interaction_pan", value: "interaction_pan" },
  { label: "interaction_zoom", value: "interaction_zoom" },
];

function buildUrl(eventType: string, appVersion: string): string {
  const params = new URLSearchParams({ minutes: "1440" });
  if (eventType) params.set("eventType", eventType);
  if (appVersion) params.set("appVersion", appVersion);
  return `/api/admin/watchdog/maps/buckets?${params.toString()}`;
}

interface PickerModalProps {
  visible: boolean;
  options: Array<{ label: string; value: string }>;
  selected: string;
  title: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function PickerModal({ visible, options, selected, title, onSelect, onClose }: PickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ps.overlay} onPress={onClose}>
        <Pressable style={ps.sheet} onPress={() => {}}>
          <Text style={ps.title}>{title}</Text>
          <FlatList
            data={options}
            keyExtractor={(item) => item.value || "__all__"}
            style={ps.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[ps.option, item.value === selected && ps.optionActive]}
                onPress={() => { onSelect(item.value); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[ps.optionText, item.value === selected && ps.optionTextActive]}>
                  {item.label}
                </Text>
                {item.value === selected && (
                  <Ionicons name="checkmark" size={14} color={Colors.accent} />
                )}
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function TelemetryBucketsSection() {
  const [filterEvent, setFilterEvent] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"event" | "version" | null>(null);

  const { data: bucketsData, isLoading, refetch } = useQuery<BucketsData>({
    queryKey: ["/api/admin/watchdog/maps/buckets", filterEvent, filterVersion],
    queryFn: () => adminFetch(buildUrl(filterEvent, filterVersion)).then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const versions = bucketsData?.versions ?? [];
  const versionOptions: Array<{ label: string; value: string }> = [
    { label: "Tutte le versioni", value: "" },
    ...versions.map((v) => ({ label: v, value: v })),
  ];

  const eventLabel = filterEvent || "Tutti";
  const versionLabel = filterVersion || "Tutte";
  const hasFilter = !!(filterEvent || filterVersion);

  return (
    <View style={s.section}>
      <View style={s.feedHeader}>
        <Text style={s.sectionTitle}>Trend 24h</Text>
        <View style={s.headerRight}>
          {hasFilter && (
            <TouchableOpacity
              style={s.clearBtn}
              onPress={() => { setFilterEvent(""); setFilterVersion(""); }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={s.clearBtnText}>Reset filtri</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => refetch()} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Ionicons name="refresh" size={14} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.filterRow}>
        <TouchableOpacity
          style={[s.filterChip, !!filterEvent && s.filterChipActive]}
          onPress={() => setPickerTarget("event")}
          activeOpacity={0.75}
        >
          <Ionicons name="funnel-outline" size={10} color={filterEvent ? Colors.accent : "#a78bfa"} />
          <Text style={[s.filterChipText, !!filterEvent && s.filterChipTextActive]} numberOfLines={1}>
            {eventLabel}
          </Text>
          <Ionicons name="chevron-down" size={10} color={Colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.filterChip, !!filterVersion && s.filterChipActive]}
          onPress={() => setPickerTarget("version")}
          activeOpacity={0.75}
        >
          <Ionicons name="phone-portrait-outline" size={10} color={filterVersion ? Colors.accent : "#60a5fa"} />
          <Text style={[s.filterChipText, !!filterVersion && s.filterChipTextActive]} numberOfLines={1}>
            {versionLabel === "Tutte" ? "Versione" : versionLabel}
          </Text>
          <Ionicons name="chevron-down" size={10} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.sparkRow}>
          <SparklineChart
            buckets={bucketsData?.buckets ?? []}
            color="#60a5fa"
            valueKey="total"
            label={filterEvent ? `${filterEvent} / ora` : "Eventi totali / ora"}
            emptyText="Nessun dato nelle ultime 24h"
          />
          {!filterEvent && (
            <>
              <View style={s.sparkDivider} />
              <SparklineChart
                buckets={bucketsData?.buckets ?? []}
                color="#f87171"
                valueKey="errors"
                label="Errori / ora"
                emptyText="Nessun errore nelle ultime 24h"
              />
            </>
          )}
        </View>
      </ScrollView>
      <Text style={s.refreshHint}>Auto-refresh ogni 2m</Text>

      <PickerModal
        visible={pickerTarget === "event"}
        options={EVENT_FILTER_OPTIONS}
        selected={filterEvent}
        title="Filtra per tipo evento"
        onSelect={setFilterEvent}
        onClose={() => setPickerTarget(null)}
      />
      <PickerModal
        visible={pickerTarget === "version"}
        options={versionOptions.length > 1 ? versionOptions : [{ label: "Nessuna versione nei dati", value: "" }]}
        selected={filterVersion}
        title="Filtra per versione app"
        onSelect={setFilterVersion}
        onClose={() => setPickerTarget(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  section: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    marginTop: 4,
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clearBtn: {
    backgroundColor: "#374151",
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  clearBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 160,
  },
  filterChipActive: {
    borderColor: Colors.accent,
  },
  filterChipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.text,
    flex: 1,
  },
  filterChipTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  sparkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingVertical: 4,
  },
  sparkDivider: {
    width: 1,
    height: 80,
    backgroundColor: Colors.border,
    alignSelf: "center",
  },
  refreshHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: "right",
    marginTop: 6,
  },
});

const ps = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    width: 300,
    maxHeight: 420,
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 12,
  },
  list: {
    maxHeight: 340,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionActive: {
    backgroundColor: Colors.accent + "18",
    borderRadius: 6,
  },
  optionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
  },
  optionTextActive: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
});
