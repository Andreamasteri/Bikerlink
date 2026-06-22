/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text, TouchableOpacity, Switch } from "react-native";
import Colors from "@/constants/colors";

export function StregattaActions({
  chatbotEnabled,
  onToggleChatbot,
  allEnabled,
  onToggleAll,
  _motionStatus,
  _onToggleMotion,
  _isTogglingMotion,
  _bboxData,
  _onToggleBbox,
  _isTogglingBbox,
  onMassSeed,
  onWakeAll,
  _onDistribute,
  _onForceMatching,
  _onResetMatches,
  onDeleteAll,
  _onCreateNew,
  isMassSeedRunning,
  massSeedCreated,
  massSeedTotal,
  _massSeedError,
  isWakingAll,
  _isDistributing,
  _isForcingMatching,
  _isResettingMatches,
  totalCount,
  _t
}: any) {
  return (
    <View style={{ padding: 16, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16 }}>Controllo Globale</Text>
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>{totalCount} Stregatti</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14 }}>Chatbot AI</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>Risposte automatiche ai messaggi</Text>
        </View>
        <Switch value={chatbotEnabled} onValueChange={onToggleChatbot} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14 }}>Visibilità Globale</Text>
          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary }}>Mostra/nascondi tutti gli stregatti</Text>
        </View>
        <Switch value={allEnabled} onValueChange={onToggleAll} />
      </View>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <TouchableOpacity onPress={onWakeAll} disabled={isWakingAll} style={{ padding: 10, backgroundColor: Colors.accent, borderRadius: 8 }}>
           <Text style={{ color: "#fff" }}>{isWakingAll ? "Sveglia..." : "Sveglia Tutti"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onMassSeed} disabled={isMassSeedRunning} style={{ padding: 10, backgroundColor: Colors.success, borderRadius: 8 }}>
           <Text style={{ color: "#fff" }}>{isMassSeedRunning ? `Seed (${massSeedCreated}/${massSeedTotal})` : "Mass Seed"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDeleteAll} style={{ padding: 10, backgroundColor: Colors.error, borderRadius: 8 }}>
           <Text style={{ color: "#fff" }}>Elimina Tutti</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
