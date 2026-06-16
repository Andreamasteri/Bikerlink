import React, { useState, useCallback } from "react";
import { View, Text, Pressable, Switch, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { MATCH_PREF_ITEMS, DEFAULT_MATCH_PREFS, type MatchPrefsPayload } from "@/lib/match-pref-items";
import { useAuth } from "@/lib/auth-context";
import { useFocusEffect } from "expo-router";

export default function MatchPrefsPanel() {
  const { user } = useAuth();
  const [matchPrefsExpanded, setMatchPrefsExpanded] = useState(false);

  const { data: matchPrefGateData, refetch: refetchMatchPrefGate } = useQuery<{ visible: boolean }>({
    queryKey: ["/api/match-preferences/gate"],
    staleTime: 120_000,
    enabled: !!user,
  });
  const matchPrefGateVisible = matchPrefGateData?.visible === true;

  useFocusEffect(
    useCallback(() => {
      if (user) refetchMatchPrefGate();
    }, [user, refetchMatchPrefGate])
  );

  const { data: matchPrefsData } = useQuery<{ preferences: MatchPrefsPayload }>({
    queryKey: ["/api/match-preferences"],
    staleTime: 120_000,
    enabled: !!user && matchPrefGateVisible,
  });
  const matchPrefs = matchPrefsData?.preferences ?? DEFAULT_MATCH_PREFS;

  const saveMatchPrefMutation = useMutation({
    mutationFn: async (updates: Partial<MatchPrefsPayload>) => {
      const res = await apiRequest("PUT", "/api/match-preferences", updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/match-preferences"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", (error as Error).message);
    },
  });

  const toggleMatchPref = (key: keyof MatchPrefsPayload, value: boolean) => {
    saveMatchPrefMutation.mutate({ [key]: value });
  };

  if (!matchPrefGateVisible) return null;

  return (
    <View style={styles.section}>
      <Pressable style={styles.accordionHeader} onPress={() => setMatchPrefsExpanded(v => !v)}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Preferenze Matching</Text>
        <Ionicons name={matchPrefsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </Pressable>
      {matchPrefsExpanded && (
        <View style={{ paddingTop: 8, gap: 2 }}>
          <Text style={{ fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular", marginBottom: 8 }}>
            Scegli i criteri con cui vuoi essere abbinato/a. Disabilitando un tipo di match non comparirai nei risultati di quella categoria.
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
              marginBottom: 6,
              borderBottomWidth: 1,
              borderBottomColor: Colors.border,
              backgroundColor: "transparent",
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
                Solo match top
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 }}>
                Ricevi push solo per Supermatch o match prioritari (le altre confluiscono nei digest).
              </Text>
            </View>
            <Switch
              value={matchPrefs.topMatchesOnly}
              onValueChange={(val) => toggleMatchPref("topMatchesOnly", val)}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
              disabled={saveMatchPrefMutation.isPending}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
              marginBottom: 6,
              borderBottomWidth: 1,
              borderBottomColor: Colors.border,
              backgroundColor: "transparent",
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
                Recap settimanale
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 }}>
                Ogni lunedì alle 9:00 ricevi una push con i tuoi 5 migliori match della settimana.
              </Text>
            </View>
            <Switch
              value={matchPrefs.weeklyRecap}
              onValueChange={(val) => toggleMatchPref("weeklyRecap", val)}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor="#fff"
              disabled={saveMatchPrefMutation.isPending}
            />
          </View>
          {MATCH_PREF_ITEMS.map((item) => (
            <View
              key={item.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text }}>
                  {item.label}
                </Text>
                {item.description ? (
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 }}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Switch
                value={matchPrefs[item.key]}
                onValueChange={(val) => toggleMatchPref(item.key, val)}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor="#fff"
                disabled={saveMatchPrefMutation.isPending}
              />
            </View>
          ))}
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
