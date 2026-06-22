import React from "react";
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, FlatList, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { StregattaCard } from "@/components/admin/stregatti/StregattaCard";
import { StregattaFilters } from "@/components/admin/stregatti/StregattaFilters";

export function StregattaList({
  users,
  flatListRef,
  insets,
  totalCount,
  chatbotEnabled,
  onToggleChatbot,
  allEnabled,
  onToggleAll,
  motionStatus,
  onToggleMotion,
  isTogglingMotion,
  bboxData,
  onToggleBbox,
  isTogglingBbox,
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
  t,
  filter,
  setFilter,
  pageStats,
  toggleAvailableMutation,
  toggleOnlineMutation,
  deleteMutation,
  openChatModal,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  styles
}: any) {
  return (
    <FlatList
      ref={flatListRef}
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      ListHeaderComponent={
        <>
          <Text style={styles.title}>Amministrazione Stregatti</Text>

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
                 <Text style={{ color: "#fff" }}>{isMassSeedRunning ? `Seed` : "Mass Seed"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDeleteAll} style={{ padding: 10, backgroundColor: Colors.error, borderRadius: 8 }}>
                 <Text style={{ color: "#fff" }}>Elimina Tutti</Text>
              </TouchableOpacity>
            </View>
          </View>

          <StregattaFilters
            activeFilter={filter}
            onFilterChange={setFilter}
            stats={pageStats}
          />
        </>
      }
      renderItem={({ item }) => (
        <StregattaCard
          user={item}
          onToggleAvailable={(id: string) => toggleAvailableMutation.mutate(id)}
          onToggleOnline={(id: string) => toggleOnlineMutation.mutate(id)}
          onDelete={(id: string, nick: string) => Alert.alert("Elimina", "Eliminare " + nick)}
          onOpenChat={openChatModal}
          isTogglingAvailable={toggleAvailableMutation.isPending && toggleAvailableMutation.variables === item.id}
          isTogglingOnline={toggleOnlineMutation.isPending && toggleOnlineMutation.variables === item.id}
          isDeleting={false}
        />
      )}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
      ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.accent} /> : null}
    />
  );
}
