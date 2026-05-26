import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { loadIndex, deleteAllOfflineTiles, deleteTilesForRoute, type OfflineTilesIndex } from "@/lib/offline-tiles";

interface OfflineMapsPanelProps {
  onIndexChanged?: () => void;
}

export default function OfflineMapsPanel({ onIndexChanged }: OfflineMapsPanelProps = {}) {
  const [offlineMapsExpanded, setOfflineMapsExpanded] = useState(false);
  const [offlineMapsIndex, setOfflineMapsIndex] = useState<OfflineTilesIndex>({});

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.accordionHeader}
        onPress={async () => {
          const next = !offlineMapsExpanded;
          setOfflineMapsExpanded(next);
          if (next) {
            const idx = await loadIndex();
            setOfflineMapsIndex(idx);
          }
        }}
      >
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Mappe offline</Text>
        <Ionicons name={offlineMapsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </Pressable>
      {offlineMapsExpanded && (
        <View style={{ paddingTop: 12, gap: 10 }}>
          {Object.keys(offlineMapsIndex).length === 0 ? (
            <View style={{ paddingVertical: 8, alignItems: "center", gap: 6 }}>
              <Ionicons name="cloud-offline-outline" size={28} color={Colors.textSecondary} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" }}>
                Nessun percorso salvato offline
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", opacity: 0.7 }}>
                Apri un giro pianificato e tocca "Scarica mappa offline"
              </Text>
            </View>
          ) : (
            <>
              {Object.values(offlineMapsIndex).map((entry) => (
                <View
                  key={entry.routeId}
                  style={{ flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, gap: 10 }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.accent + "22", justifyContent: "center", alignItems: "center" }}>
                    <Ionicons name="cloud-done-outline" size={20} color={Colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text }} numberOfLines={1}>
                      {entry.title}
                    </Text>
                    <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>
                      {(entry.bytesEstimated / 1_000_000).toFixed(1)} MB · {entry.tileCount} tile
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={10}
                    onPress={() =>
                      Alert.alert(
                        "Elimina mappa",
                        `Rimuovere la mappa offline per "${entry.title}"?`,
                        [
                          { text: "Annulla", style: "cancel" },
                          {
                            text: "Elimina",
                            style: "destructive",
                            onPress: async () => {
                              await deleteTilesForRoute(entry.routeId);
                              const updated = await loadIndex();
                              setOfflineMapsIndex(updated);
                              onIndexChanged?.();
                            },
                          },
                        ]
                      )
                    }
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.accentRed} />
                  </Pressable>
                </View>
              ))}

              {Object.keys(offlineMapsIndex).length > 1 && (
                <Pressable
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.accentRed + "18", borderRadius: 10, paddingVertical: 10 }}
                  onPress={() =>
                    Alert.alert(
                      "Elimina tutto",
                      "Eliminare tutte le mappe offline scaricate?",
                      [
                        { text: "Annulla", style: "cancel" },
                        {
                          text: "Elimina tutto",
                          style: "destructive",
                          onPress: async () => {
                            await deleteAllOfflineTiles();
                            setOfflineMapsIndex({});
                            onIndexChanged?.();
                          },
                        },
                      ]
                    )
                  }
                >
                  <Ionicons name="trash-bin-outline" size={16} color={Colors.accentRed} />
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accentRed }}>
                    Elimina tutto ({Object.keys(offlineMapsIndex).length} mappe)
                  </Text>
                </Pressable>
              )}

              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, textAlign: "center", opacity: 0.7 }}>
                Totale:{" "}
                {(
                  Object.values(offlineMapsIndex).reduce((sum, e) => sum + e.bytesEstimated, 0) /
                  1_000_000
                ).toFixed(1)}{" "}
                MB
              </Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
});
