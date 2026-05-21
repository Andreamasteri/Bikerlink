import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface StregattaActionsProps {
  chatbotEnabled: boolean;
  onToggleChatbot: (val: boolean) => void;
  allEnabled: boolean;
  onToggleAll: (val: boolean) => void;
  onMassSeed: () => void;
  onWakeAll: () => void;
  onDistribute: () => void;
  onForceMatching: () => void;
  onResetMatches: () => void;
  onDeleteAll: () => void;
  onCreateNew: () => void;
  isMassSeedRunning: boolean;
  massSeedCreated: number;
  massSeedTotal: number;
  massSeedError: string | null;
  isWakingAll: boolean;
  isDistributing: boolean;
  isForcingMatching: boolean;
  isResettingMatches: boolean;
  totalCount: number;
  t: (key: string) => string;
}

export function StregattaActions({
  chatbotEnabled,
  onToggleChatbot,
  allEnabled,
  onToggleAll,
  onMassSeed,
  onWakeAll,
  onDistribute,
  onForceMatching,
  onResetMatches,
  onDeleteAll,
  onCreateNew,
  isMassSeedRunning,
  massSeedCreated,
  massSeedTotal,
  massSeedError,
  isWakingAll,
  isDistributing,
  isForcingMatching,
  isResettingMatches,
  totalCount,
  t,
}: StregattaActionsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.controlsCard}>
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Ionicons name="chatbubble-ellipses" size={24} color={Colors.accent} />
            <Text style={styles.controlLabel}>Stregatti Chatbot</Text>
          </View>
          <Switch
            value={chatbotEnabled}
            onValueChange={onToggleChatbot}
            trackColor={{ false: "#767577", true: Colors.accent }}
            thumbColor={Platform.OS === "ios" ? "#fff" : chatbotEnabled ? "#fff" : "#f4f3f4"}
          />
        </View>
        <Text style={styles.controlDesc}>
          Se attivo, gli stregatti risponderanno automaticamente usando l'IA.
        </Text>

        <View style={styles.controlDivider} />

        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Ionicons name="people" size={24} color={Colors.accent} />
            <Text style={styles.controlLabel}>Visibilità Globale</Text>
          </View>
          <Switch
            value={allEnabled}
            onValueChange={onToggleAll}
            trackColor={{ false: "#767577", true: Colors.accent }}
            thumbColor={Platform.OS === "ios" ? "#fff" : allEnabled ? "#fff" : "#f4f3f4"}
          />
        </View>
        <Text style={styles.controlDesc}>
          Nascondi o mostra tutti gli stregatti contemporaneamente.
        </Text>
      </View>

      <View style={styles.gridContainer}>
        <TouchableOpacity style={styles.actionBtn} onPress={onCreateNew}>
          <Ionicons name="person-add" size={22} color={Colors.accent} />
          <Text style={styles.actionBtnText}>Nuovo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onWakeAll} disabled={isWakingAll}>
          {isWakingAll ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <MaterialIcons name="bolt" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Sveglia</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onDistribute} disabled={isDistributing}>
          {isDistributing ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <MaterialIcons name="account-balance" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Club</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onMassSeed} disabled={isMassSeedRunning}>
          {isMassSeedRunning ? (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={{ fontSize: 9, color: Colors.accent }}>{massSeedCreated}</Text>
            </View>
          ) : (
            <>
              <MaterialIcons name="group-add" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Massive</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.gridContainer, { marginTop: 12 }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={onForceMatching} disabled={isForcingMatching}>
          {isForcingMatching ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <Ionicons name="heart" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Match</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onResetMatches} disabled={isResettingMatches}>
          {isResettingMatches ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <Ionicons name="heart-dislike" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Reset Match</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {isMassSeedRunning && (
        <View style={styles.seedStatus}>
          <Text style={styles.seedStatusText}>
            Creazione in corso: {massSeedCreated} / {massSeedTotal}
          </Text>
        </View>
      )}

      {!!massSeedError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{massSeedError}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.deleteAllBtn} onPress={onDeleteAll}>
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.deleteAllBtnText}>Elimina tutti ({totalCount})</Text>
      </TouchableOpacity>
    </View>
  );
}

import { Platform } from "react-native";

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  controlsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  controlLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  controlDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  controlDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  gridContainer: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.text,
  },
  deleteAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  deleteAllBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  seedStatus: {
    marginTop: 10,
    padding: 8,
    backgroundColor: Colors.accent + "20",
    borderRadius: 8,
    alignItems: "center",
  },
  seedStatusText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  errorBanner: {
    marginTop: 10,
    padding: 8,
    backgroundColor: Colors.error + "20",
    borderRadius: 8,
    alignItems: "center",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.error,
  },
});
