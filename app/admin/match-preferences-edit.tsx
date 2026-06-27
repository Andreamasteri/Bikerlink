import React, { useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import {
  MATCH_PREF_ITEMS,
  DEFAULT_MATCH_PREFS,
  type MatchPrefsPayload,
} from "@/lib/match-pref-items";

export default function AdminMatchPreferencesEditScreen() {
  const { userId, nickname } = useLocalSearchParams<{ userId: string; nickname?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const queryKey = ["/api/admin/users", userId, "match-preferences"];

  const { data, isLoading } = useQuery<{ preferences: MatchPrefsPayload }>({
    queryKey,
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}/match-preferences`, base);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Errore caricamento preferenze");
      return res.json();
    },
    enabled: !!userId,
  });

  const prefs = data?.preferences ?? DEFAULT_MATCH_PREFS;

  const saveMutation = useMutation({
    mutationFn: async (updates: Partial<MatchPrefsPayload>) => {
      const res = await apiRequest("PUT", `/api/admin/users/${userId}/match-preferences`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "matches"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile salvare la preferenza"),
  });

  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  const togglePref = useCallback(
    (key: keyof MatchPrefsPayload, value: boolean) => {
      saveMutationRef.current.mutate({ [key]: value });
    },
    [],
  );

  const resetMutation = useMutation({
    mutationFn: async () => {
      const base = getApiUrl();
      const url = new URL(`/api/admin/users/${userId}/match-preferences`, base);
      const res = await fetch(url.toString(), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Errore reset preferenze");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "matches"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile resettare le preferenze"),
  });

  const resetMutationRef = useRef(resetMutation);
  resetMutationRef.current = resetMutation;

  const resetAll = useCallback(() => {
    Alert.alert(
      "Ripristina tutto",
      "Tutte le preferenze verranno riportate al valore predefinito (ON). Continuare?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Ripristina",
          style: "destructive",
          onPress: () => resetMutationRef.current.mutate(),
        },
      ],
    );
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
  }

  const disabledCount = MATCH_PREF_ITEMS.filter((item) => !prefs[item.key]).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.headerCard}>
        <Ionicons name="options" size={20} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            {nickname ? `Preferenze di ${nickname}` : "Preferenze matching"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {disabledCount === 0
              ? "Tutte le preferenze attive"
              : `${disabledCount} su ${MATCH_PREF_ITEMS.length} disabilitate`}
          </Text>
        </View>
        {disabledCount > 0 && (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={resetAll}
            disabled={saveMutation.isPending || resetMutation.isPending}
            testID="reset-all-btn"
          >
            <Text style={styles.resetBtnText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.sectionLabel}>{MATCH_PREF_ITEMS.length} Criteri di matching</Text>

      <View style={styles.card}>
        {MATCH_PREF_ITEMS.map((item, index) => {
          const isOn = prefs[item.key];
          const isLast = index === MATCH_PREF_ITEMS.length - 1;
          return (
            <View
              key={item.key}
              style={[styles.prefRow, !isLast && styles.prefRowBorder]}
              testID={`pref-row-${item.key}`}
            >
              <Text style={[styles.prefLabel, !isOn && styles.prefLabelOff]}>
                {item.label}
              </Text>
              <Switch
                value={isOn}
                onValueChange={(val) => togglePref(item.key, val)}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
                disabled={saveMutation.isPending}
                testID={`pref-switch-${item.key}`}
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        Le modifiche vengono salvate immediatamente. Per ricalcolare i match, torna al profilo e usa "Ricalcola ora".
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
  },
  headerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    margin: 16,
    marginBottom: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  resetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.error + "22",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error + "55",
  },
  resetBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.error,
  },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    marginHorizontal: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  prefRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  prefLabel: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
    marginRight: 12,
  },
  prefLabelOff: {
    color: Colors.textSecondary,
  },
  footnote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginHorizontal: 16,
    marginTop: 16,
    lineHeight: 16,
    textAlign: "center",
  },
});
