import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";

type Pref = {
  id: string;
  kind: string;
  value: Record<string, unknown>;
  source: "manual" | "auto_suggested";
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  bike_type: "Tipo moto da escludere",
  age_range: "Fascia d'età",
  max_distance: "Raggio massimo (km)",
  requires_photo: "Solo profili con foto",
  requires_verified: "Solo profili verificati",
  exclude_user_type: "Escludi tipo utente",
  exclude_region: "Escludi regione",
};

function describePref(p: Pref): string {
  const v = p.value as Record<string, unknown>;
  switch (p.kind) {
    case "bike_type":
      return `Moto: ${String(v.type)}`;
    case "age_range":
      return `Età: ${v.min ?? "-"} – ${v.max ?? "-"}`;
    case "max_distance":
      return `> ${v.km} km`;
    case "requires_photo":
      return v.enabled ? "Solo con foto" : "Tutti";
    case "requires_verified":
      return v.enabled ? "Solo verificati" : "Tutti";
    case "exclude_user_type":
      return `Escludi ${v.userType}`;
    case "exclude_region":
      return `Escludi ${v.region}`;
    default:
      return JSON.stringify(v);
  }
}

export default function NegativePreferencesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [bikeType, setBikeType] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [excludeRegion, setExcludeRegion] = useState("");
  const [_requiresPhoto, setRequiresPhoto] = useState(false);
  const [_requiresVerified, setRequiresVerified] = useState(false);

  const { data, isLoading } = useQuery<{ preferences: Pref[] }>({
    queryKey: ["/api/match-negative-preferences"],
  });
  const prefs = data?.preferences ?? [];

  const addMutation = useMutation({
    mutationFn: async (body: { kind: string; value: unknown }) => {
      const res = await apiRequest("POST", "/api/match-negative-preferences", body);
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/match-negative-preferences"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message || "Impossibile salvare"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/match-negative-preferences/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/match-negative-preferences"] }),
  });

  const handleToggleRequires = (kind: "requires_photo" | "requires_verified", next: boolean) => {
    if (kind === "requires_photo") setRequiresPhoto(next);
    else setRequiresVerified(next);
    const existing = prefs.find((p) => p.kind === kind);
    if (next) {
      addMutation.mutate({ kind, value: { enabled: true } });
    } else if (existing) {
      deleteMutation.mutate(existing.id);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const photoActive = prefs.some((p) => p.kind === "requires_photo" && (p.value as { enabled?: boolean }).enabled);
  const verifiedActive = prefs.some((p) => p.kind === "requires_verified" && (p.value as { enabled?: boolean }).enabled);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        Filtri esclusivi: i profili che corrispondono a questi criteri non ti verranno mai mostrati. Vengono applicati prima del calcolo dello score.
      </Text>

      <Section title="Esigenze di base" colors={colors}>
        <RowSwitch
          label="Solo profili con foto"
          value={photoActive}
          onChange={(v) => handleToggleRequires("requires_photo", v)}
          colors={colors}
        />
        <RowSwitch
          label="Solo profili verificati (email)"
          value={verifiedActive}
          onChange={(v) => handleToggleRequires("requires_verified", v)}
          colors={colors}
        />
      </Section>

      <Section title="Aggiungi filtro tipo moto" colors={colors}>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="es. scooter, supermotard"
            placeholderTextColor={colors.textSecondary}
            value={bikeType}
            onChangeText={setBikeType}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            testID="neg-pref-bike-type-input"
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!bikeType.trim()) return;
              addMutation.mutate({ kind: "bike_type", value: { type: bikeType.trim().toLowerCase() } });
              setBikeType("");
            }}
            testID="neg-pref-bike-type-add"
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Fascia d'età" colors={colors}>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="Min"
            placeholderTextColor={colors.textSecondary}
            value={ageMin}
            onChangeText={setAgeMin}
            keyboardType="number-pad"
            style={[styles.input, { color: colors.text, borderColor: colors.border, flex: 1 }]}
          />
          <TextInput
            placeholder="Max"
            placeholderTextColor={colors.textSecondary}
            value={ageMax}
            onChangeText={setAgeMax}
            keyboardType="number-pad"
            style={[styles.input, { color: colors.text, borderColor: colors.border, flex: 1, marginLeft: 8 }]}
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              const min = parseInt(ageMin, 10);
              const max = parseInt(ageMax, 10);
              const value: { min?: number; max?: number } = {};
              if (Number.isFinite(min)) value.min = min;
              if (Number.isFinite(max)) value.max = max;
              if (value.min === undefined && value.max === undefined) return;
              addMutation.mutate({ kind: "age_range", value });
              setAgeMin("");
              setAgeMax("");
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Raggio massimo" colors={colors}>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="km"
            placeholderTextColor={colors.textSecondary}
            value={maxKm}
            onChangeText={setMaxKm}
            keyboardType="number-pad"
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              const km = parseInt(maxKm, 10);
              if (!Number.isFinite(km) || km <= 0) return;
              addMutation.mutate({ kind: "max_distance", value: { km } });
              setMaxKm("");
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Escludi regione" colors={colors}>
        <View style={styles.inputRow}>
          <TextInput
            placeholder="es. Lombardia"
            placeholderTextColor={colors.textSecondary}
            value={excludeRegion}
            onChangeText={setExcludeRegion}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              if (!excludeRegion.trim()) return;
              addMutation.mutate({ kind: "exclude_region", value: { region: excludeRegion.trim() } });
              setExcludeRegion("");
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </Section>

      <Section title="Escludi tipo utente" colors={colors}>
        <View style={styles.chipRow}>
          {(["biker", "zavorrina"] as const).map((ut) => (
            <TouchableOpacity
              key={ut}
              style={[styles.chip, { borderColor: colors.border }]}
              onPress={() => addMutation.mutate({ kind: "exclude_user_type", value: { userType: ut } })}
            >
              <Text style={{ color: colors.text }}>Escludi {ut}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <Section title="Filtri attivi" colors={colors}>
        {prefs.length === 0 ? (
          <Text style={{ color: colors.textSecondary, fontStyle: "italic" }}>Nessun filtro negativo attivo.</Text>
        ) : (
          prefs.map((p) => (
            <View
              key={p.id}
              style={[styles.prefRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
              testID={`neg-pref-row-${p.kind}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {KIND_LABELS[p.kind] ?? p.kind}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{describePref(p)}</Text>
                {p.source === "auto_suggested" && (
                  <Text style={{ color: colors.primary, fontSize: 12, marginTop: 2 }}>
                    Auto-suggerito
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => deleteMutation.mutate(p.id)}
                testID={`neg-pref-delete-${p.id}`}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function RowSwitch({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.switchRow, { borderColor: colors.border }]}>
      <Text style={{ color: colors.text, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  intro: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700" as const, marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  addBtn: { width: 44, height: 44, borderRadius: 8, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  prefRow: { flexDirection: "row", alignItems: "center", padding: 12, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
});
