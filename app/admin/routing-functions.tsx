/**
 * Task #3193 — Assegnazione funzioni per engine (Admin).
 *
 * Per ogni funzione di routing (calcolo percorso, map matching, isocrone,
 * matrice) l'admin sceglie quale engine usare tra quelli supportati. La scelta
 * è persistita su DB (AppSetting `routing_function_engines`) e consumata dal
 * SmartRouterSelector.
 *
 * Dati:
 *   GET /api/admin/routing/function-engines → { functions, config }
 *   PUT /api/admin/routing/function-engines → { config: { <fn>: <engine> } }
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import type {
  FunctionEnginesResponse,
  RoutingFunctionId,
} from "@/components/admin/routing-control/types";

const ENGINE_LABELS: Record<string, string> = {
  graphhopper: "GraphHopper",
  valhalla: "Valhalla",
  tomtom: "TomTom",
  "mapbox-directions": "Mapbox",
};

const FUNCTION_ICONS: Record<RoutingFunctionId, string> = {
  routing: "map-marker-path",
  map_matching: "map-marker-distance",
  isochrone: "blur-radial",
  matrix: "grid",
};

export default function RoutingFunctionsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<FunctionEnginesResponse>({
    queryKey: ["/api/admin/routing/function-engines"],
    staleTime: 10000,
  });

  const mutation = useMutation({
    mutationFn: async (payload: { fn: RoutingFunctionId; engine: string }) => {
      const res = await apiRequest("PUT", "/api/admin/routing/function-engines", {
        config: { [payload.fn]: payload.engine },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing/function-engines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/routing/status"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Impossibile salvare la scelta";
      Alert.alert("Errore", msg);
    },
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.intro}>
        <Text style={styles.introText}>
          Scegli quale engine serve ogni funzione di routing. Le funzioni con un
          solo engine supportato sono bloccate su quello.
        </Text>
      </View>

      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      )}

      {data?.functions.map((fn) => {
        const selected = data.config[fn.id] ?? fn.defaultEngine;
        const locked = fn.supportedEngines.length <= 1;
        return (
          <View key={fn.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name={(FUNCTION_ICONS[fn.id] ?? "cog") as never}
                size={22}
                color={Colors.accent}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{fn.label}</Text>
                <Text style={styles.cardDesc}>{fn.description}</Text>
              </View>
            </View>

            <View style={styles.chipRow}>
              {fn.supportedEngines.map((engine) => {
                const active = engine === selected;
                const disabled = locked || mutation.isPending;
                return (
                  <TouchableOpacity
                    key={engine}
                    testID={`fn-${fn.id}-engine-${engine}`}
                    style={[styles.chip, active && styles.chipActive, locked && styles.chipLocked]}
                    disabled={disabled || active}
                    onPress={() => mutation.mutate({ fn: fn.id, engine })}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {ENGINE_LABELS[engine] ?? engine}
                    </Text>
                    {active && (
                      <MaterialCommunityIcons
                        name={locked ? "lock" : "check"}
                        size={14}
                        color="#fff"
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  intro: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  introText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  loading: {
    paddingVertical: 24,
    alignItems: "center",
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  cardDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipLocked: {
    opacity: 0.85,
  },
  chipText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#fff",
  },
});
