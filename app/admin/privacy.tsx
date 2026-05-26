import React from "react";
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest, queryClient } from "@/lib/query-client";

type MapFilter = "all" | "online_only" | "available_only";

interface PrivacyRules {
  showDistanceInCounter: boolean;
  offlinePositionRandomize: boolean;
  mapVisibilityFilter: MapFilter;
}

const FILTER_OPTIONS: { value: MapFilter; label: string; description: string }[] = [
  { value: "all", label: "Tutti gli utenti", description: "Mostra utenti online e offline sulla mappa" },
  { value: "online_only", label: "Solo online", description: "Mostra solo gli utenti attualmente connessi" },
  { value: "available_only", label: "Solo disponibili", description: "Mostra solo gli utenti contrassegnati come disponibili" },
];

export default function AdminPrivacy() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data, isLoading, isError, refetch } = useQuery<PrivacyRules>({
    queryKey: ["/api/admin/privacy-rules"],
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Partial<PrivacyRules>) => {
      const res = await apiRequest("PATCH", "/api/admin/privacy-rules", patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/privacy-rules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/show-distance-counter"] });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error shape from mutation
    onError: (err: any) => {
      Alert.alert("Errore", err?.message || "Impossibile aggiornare le regole di privacy");
    },
  });

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={40} color={colors.textSecondary} />
        <Text style={[styles.errorText, { color: colors.text }]}>Impossibile caricare le impostazioni</Text>
        <TouchableOpacity onPress={() => refetch()} style={[styles.retryButton, { backgroundColor: colors.accent }]}>
          <Text style={[styles.retryButtonText, { color: "#fff" }]}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
    >
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <MaterialCommunityIcons name="shield-lock" size={28} color={colors.accent} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Gestione Privacy</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Regole globali applicate dal backend a tutti gli utenti
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.label, { color: colors.text }]}>Mostra distanza nel counter</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Se attivo, gli utenti vedono la distanza in km accanto agli altri biker. Se disattivato, la distanza è nascosta ovunque.
            </Text>
          </View>
          <Switch
            value={data.showDistanceInCounter}
            onValueChange={(v) => mutation.mutate({ showDistanceInCounter: v })}
            disabled={mutation.isPending}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.label, { color: colors.text }]}>Randomizzazione posizione offline</Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              Quando attivo, la posizione mostrata per gli utenti offline viene randomizzata entro un raggio per proteggere la privacy. Se disattivato a livello globale, viene mostrata la posizione reale anche se l'utente l'ha attivata.
            </Text>
          </View>
          <Switch
            value={data.offlinePositionRandomize}
            onValueChange={(v) => mutation.mutate({ offlinePositionRandomize: v })}
            disabled={mutation.isPending}
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.text, marginBottom: 4 }]}>Visibilità mappa per stato</Text>
        <Text style={[styles.description, { color: colors.textSecondary, marginBottom: 12 }]}>
          Controlla quali utenti vengono restituiti dall'API per la lista/mappa.
        </Text>
        {FILTER_OPTIONS.map((opt) => {
          const selected = data.mapVisibilityFilter === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => mutation.mutate({ mapVisibilityFilter: opt.value })}
              disabled={mutation.isPending}
              style={[
                styles.option,
                { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent + "15" : "transparent" },
              ]}
            >
              <MaterialCommunityIcons
                name={selected ? "radiobox-marked" : "radiobox-blank"}
                size={22}
                color={selected ? colors.accent : colors.textSecondary}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.optionLabel, { color: colors.text }]}>{opt.label}</Text>
                <Text style={[styles.optionDescription, { color: colors.textSecondary }]}>{opt.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {mutation.isPending && (
        <View style={styles.savingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={[styles.savingText, { color: colors.textSecondary }]}>Salvataggio...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 12, marginBottom: 16 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  card: { padding: 16, borderRadius: 12, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  description: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 18 },
  option: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  optionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  optionDescription: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  savingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8 },
  savingText: { marginLeft: 8, fontSize: 13, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 15, fontFamily: "Inter_500Medium", marginTop: 12, marginBottom: 20, textAlign: "center" },
  retryButton: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
