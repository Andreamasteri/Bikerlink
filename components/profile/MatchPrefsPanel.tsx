import React, { useState, useCallback } from "react";
import { View, Text, Pressable, Switch, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import {
  MATCH_PREF_ITEMS,
  MATCH_PREF_SECTIONS,
  DEFAULT_MATCH_PREFS,
  type MatchPrefsPayload,
  type MatchPrefSection,
} from "@/lib/match-pref-items";
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

  const itemsBySection = MATCH_PREF_SECTIONS.reduce<
    Record<MatchPrefSection, typeof MATCH_PREF_ITEMS>
  >((acc, section) => {
    acc[section] = MATCH_PREF_ITEMS.filter((item) => item.section === section);
    return acc;
  }, {} as Record<MatchPrefSection, typeof MATCH_PREF_ITEMS>);

  return (
    <View style={styles.section}>
      <Pressable style={styles.accordionHeader} onPress={() => setMatchPrefsExpanded(v => !v)}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Preferenze Matching</Text>
        <Ionicons name={matchPrefsExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </Pressable>
      {matchPrefsExpanded && (
        <View style={{ paddingTop: 8 }}>
          <Text style={styles.introText}>
            Scegli i criteri con cui vuoi essere abbinato/a. Disabilitando un tipo di match non comparirai nei risultati di quella categoria.
          </Text>
          {MATCH_PREF_SECTIONS.map((section) => {
            const items = itemsBySection[section];
            if (!items || items.length === 0) return null;
            return (
              <View key={section} style={styles.sectionGroup}>
                <Text style={styles.sectionLabel}>{section}</Text>
                {items.map((item, idx) => (
                  <View
                    key={item.key}
                    style={[
                      styles.toggleRow,
                      idx === items.length - 1 && styles.toggleRowLast,
                    ]}
                  >
                    <View style={styles.toggleTextWrap}>
                      <Text style={styles.toggleLabel}>{item.label}</Text>
                      {item.description ? (
                        <Text style={styles.toggleDescription}>{item.description}</Text>
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
            );
          })}
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
  introText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  sectionGroup: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toggleRowLast: {
    borderBottomWidth: 0,
  },
  toggleTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  toggleDescription: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
