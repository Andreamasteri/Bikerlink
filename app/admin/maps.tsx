import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import {
  RENDERER_OPTIONS,
  TILE_OPTIONS,
  ROUTING_OPTIONS,
  ROUTING_PROFILE_OPTIONS,
  ROLLOUT_VALUES,
  type MapsConfig,
  type MapsOption,
  type MapsRollout,
  type MapsRendererId,
  type MapsTileId,
  type RoutingEngineId,
  type RoutingProfileId,
} from "@shared/maps-config";

interface MapsConfigResponse extends MapsConfig {
  available_renderers: typeof RENDERER_OPTIONS;
  available_tiles: typeof TILE_OPTIONS;
  available_routings: typeof ROUTING_OPTIONS;
  available_profiles: typeof ROUTING_PROFILE_OPTIONS;
}

const ROLLOUT_LABELS: Record<MapsRollout, { label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  disabled: { label: "Disabilitato", desc: "Nessun utente (solo admin) vede i renderer/routing alternativi.", icon: "lock-closed", color: "#9CA3AF" },
  tester: { label: "Solo Tester", desc: "Admin + utenti con flag Map Tester. Default consigliato per QA.", icon: "flask", color: "#F59E0B" },
  all: { label: "Tutti gli utenti", desc: "Rollout completo. Da attivare solo dopo test estesi.", icon: "globe", color: "#10B981" },
};

export default function AdminMapsPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();

  const isAdmin = user?.role === "admin";

  const { data, isLoading } = useQuery<MapsConfigResponse>({
    queryKey: ["/api/admin/maps/config"],
    enabled: isAdmin,
  });

  const rolloutMutation = useMutation({
    mutationFn: async (rollout: MapsRollout) => {
      const res = await apiRequest("PUT", "/api/admin/maps/rollout", { rollout });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps-rollout"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare rollout"),
  });

  const rendererMutation = useMutation({
    mutationFn: async (body: { renderer: MapsRendererId; tile: MapsTileId }) => {
      const res = await apiRequest("PUT", "/api/admin/maps/renderer", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps-rollout"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare renderer"),
  });

  const routingMutation = useMutation({
    mutationFn: async (body: { engine: RoutingEngineId; profile: RoutingProfileId }) => {
      const res = await apiRequest("PUT", "/api/admin/maps/routing", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/maps-rollout"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare routing"),
  });

  const notesMutation = useMutation({
    mutationFn: async (body: { renderer_notes?: string; routing_notes?: string }) => {
      const res = await apiRequest("PUT", "/api/admin/maps/notes", body);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/maps/config"] }),
  });

  if (!isAdmin) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Accesso riservato agli amministratori</Text>
      </View>
    );
  }
  if (isLoading || !data) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Sistema Mappe",
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 8 }}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      >
        <Banner colors={colors} />

        <RolloutCard
          colors={colors}
          current={data.rollout}
          onChange={(v) => rolloutMutation.mutate(v)}
          pending={rolloutMutation.isPending}
        />

        <RenderingCard
          colors={colors}
          renderer={data.renderer}
          tile={data.tile}
          notes={data.renderer_notes}
          onSelectRenderer={(r) => rendererMutation.mutate({ renderer: r, tile: data.tile })}
          onSelectTile={(t) => rendererMutation.mutate({ renderer: data.renderer, tile: t })}
          onNotesChange={(v) => notesMutation.mutate({ renderer_notes: v })}
          pending={rendererMutation.isPending}
        />

        <RoutingCard
          colors={colors}
          engine={data.routing}
          profile={data.profile}
          notes={data.routing_notes}
          onSelectEngine={(e) => routingMutation.mutate({ engine: e, profile: data.profile })}
          onSelectProfile={(p) => routingMutation.mutate({ engine: data.routing, profile: p })}
          onNotesChange={(v) => notesMutation.mutate({ routing_notes: v })}
          pending={routingMutation.isPending}
        />
      </ScrollView>
    </>
  );
}

type ColorsT = ReturnType<typeof useTheme>["colors"];

function Banner({ colors }: { colors: ColorsT }) {
  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="information-circle" size={20} color="#3B82F6" />
      <Text style={[styles.bannerText, { color: colors.text }]}>
        Fondazione Sistema Mappe (task #2311). I renderer/routing alternativi sono in lavorazione (task #2312-#2315): solo le opzioni marcate &quot;Disponibile&quot; sono attive. Gli utenti non eleggibili al rollout vedranno sempre Leaflet + Carto Light + GraphHopper Moto-Curvy.
      </Text>
    </View>
  );
}

function RolloutCard({ colors, current, onChange, pending }: { colors: ColorsT; current: MapsRollout; onChange: (v: MapsRollout) => void; pending: boolean }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name="git-branch" size={20} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>Rollout Sistema</Text>
        {pending && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>
      <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>Controlla chi può vedere i renderer e routing sperimentali.</Text>
      {ROLLOUT_VALUES.map((v) => {
        const meta = ROLLOUT_LABELS[v];
        const active = current === v;
        return (
          <TouchableOpacity
            key={v}
            onPress={() => !active && onChange(v)}
            style={[styles.radioRow, { borderColor: active ? meta.color : colors.border, backgroundColor: active ? `${meta.color}15` : "transparent" }]}
            activeOpacity={0.7}
          >
            <View style={[styles.radioDot, { borderColor: meta.color, backgroundColor: active ? meta.color : "transparent" }]} />
            <Ionicons name={meta.icon} size={18} color={meta.color} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.radioLabel, { color: colors.text }]}>{meta.label}</Text>
              <Text style={[styles.radioDesc, { color: colors.textSecondary }]}>{meta.desc}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RenderingCard(props: {
  colors: ColorsT;
  renderer: MapsRendererId;
  tile: MapsTileId;
  notes: string;
  onSelectRenderer: (r: MapsRendererId) => void;
  onSelectTile: (t: MapsTileId) => void;
  onNotesChange: (v: string) => void;
  pending: boolean;
}) {
  const { colors, renderer, tile, notes, onSelectRenderer, onSelectTile, onNotesChange, pending } = props;
  const categories = useMemo(() => {
    const map = new Map<string, MapsOption<MapsTileId>[]>();
    for (const opt of TILE_OPTIONS) {
      const key = opt.category || "Altro";
      const arr = map.get(key) ?? [];
      arr.push(opt);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name="map" size={20} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>Rendering</Text>
        {pending && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Renderer</Text>
      {RENDERER_OPTIONS.map((opt) => (
        <OptionRow key={opt.id} opt={opt} active={renderer === opt.id} colors={colors} onPress={() => opt.implemented && onSelectRenderer(opt.id)} />
      ))}

      <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 16 }]}>Tile / Mappa Base</Text>
      {categories.map(([cat, opts]) => (
        <View key={cat} style={{ marginBottom: 8 }}>
          <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>{cat}</Text>
          {opts.map((opt) => (
            <OptionRow key={opt.id} opt={opt} active={tile === opt.id} colors={colors} onPress={() => opt.implemented && onSelectTile(opt.id)} />
          ))}
        </View>
      ))}

      <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12 }]}>Note tecniche (renderer)</Text>
      <DebouncedNotes value={notes} onCommit={onNotesChange} colors={colors} placeholder="Appunti su tile keys, fallback, perf..." />
    </View>
  );
}

function RoutingCard(props: {
  colors: ColorsT;
  engine: RoutingEngineId;
  profile: RoutingProfileId;
  notes: string;
  onSelectEngine: (e: RoutingEngineId) => void;
  onSelectProfile: (p: RoutingProfileId) => void;
  onNotesChange: (v: string) => void;
  pending: boolean;
}) {
  const { colors, engine, profile, notes, onSelectEngine, onSelectProfile, onNotesChange, pending } = props;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Ionicons name="navigate" size={20} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>Routing</Text>
        {pending && <ActivityIndicator size="small" style={{ marginLeft: 8 }} />}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.text }]}>Engine</Text>
      {ROUTING_OPTIONS.map((opt) => (
        <OptionRow key={opt.id} opt={opt} active={engine === opt.id} colors={colors} onPress={() => opt.implemented && onSelectEngine(opt.id)} />
      ))}

      <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 16 }]}>Profilo</Text>
      {ROUTING_PROFILE_OPTIONS.map((opt) => (
        <OptionRow key={opt.id} opt={opt} active={profile === opt.id} colors={colors} onPress={() => opt.implemented && onSelectProfile(opt.id)} />
      ))}

      <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 12 }]}>Note tecniche (routing)</Text>
      <DebouncedNotes value={notes} onCommit={onNotesChange} colors={colors} placeholder="Appunti su quote API, fallback policy, costi..." />
    </View>
  );
}

function OptionRow<T extends string>({ opt, active, colors, onPress }: { opt: MapsOption<T>; active: boolean; colors: ColorsT; onPress: () => void }) {
  const disabled = !opt.implemented;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || active}
      activeOpacity={disabled ? 1 : 0.7}
      style={[
        styles.optionRow,
        { borderColor: active ? "#3B82F6" : colors.border, backgroundColor: active ? "rgba(59,130,246,0.10)" : "transparent", opacity: disabled ? 0.55 : 1 },
      ]}
    >
      <View style={[styles.radioDot, { borderColor: active ? "#3B82F6" : colors.border, backgroundColor: active ? "#3B82F6" : "transparent" }]} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
          <View style={[styles.pill, { backgroundColor: opt.implemented ? "#DCFCE7" : "#FEF3C7" }]}>
            <Text style={[styles.pillText, { color: opt.implemented ? "#15803D" : "#92400E" }]}>{opt.implemented ? "Disponibile" : "WIP"}</Text>
          </View>
        </View>
        <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>{opt.description}</Text>
      </View>
    </TouchableOpacity>
  );
}

function DebouncedNotes({ value, onCommit, colors, placeholder }: { value: string; onCommit: (v: string) => void; colors: ColorsT; placeholder: string }) {
  const [local, setLocal] = useState(value);
  const lastCommitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value !== lastCommitted.current) {
      setLocal(value);
      lastCommitted.current = value;
    }
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (v !== lastCommitted.current) {
        lastCommitted.current = v;
        onCommit(v);
      }
    }, 1000);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <TextInput
      value={local}
      onChangeText={handleChange}
      multiline
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      style={[styles.notesInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16, alignItems: "flex-start" },
  bannerText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18, flex: 1 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 10 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 6 },
  categoryLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, marginBottom: 4 },
  radioRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  radioDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  radioLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  radioDesc: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  optionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  optionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 80, fontFamily: "Inter_400Regular", fontSize: 13, textAlignVertical: "top" },
});
