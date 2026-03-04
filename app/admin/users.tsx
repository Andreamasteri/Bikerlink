import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator, TextInput } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

export default function AdminUsersScreen() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["/api/admin/users"] });

  const users = ((data as any)?.users || []).filter((u: any) =>
    u.nickname.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = async (userId: string, action: string, body?: any) => {
    try {
      await apiRequest("PUT", `/api/admin/users/${userId}/${action}`, body);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      Alert.alert("Fatto", `Azione "${action}" completata`);
    } catch (err) {
      Alert.alert("Errore", "Azione fallita");
    }
  };

  const showActions = (user: any) => {
    Alert.alert(user.nickname, `Email: ${user.email}\nRuolo: ${user.role}\nStato: ${user.status}`, [
      { text: "Annulla", style: "cancel" },
      user.status !== "blocked" ? { text: "Blocca", onPress: () => handleAction(user.id, "block"), style: "destructive" } : { text: "Sblocca", onPress: () => handleAction(user.id, "unblock") },
      { text: "Sospendi 24h", onPress: () => handleAction(user.id, "suspend", { hours: 24 }) },
      { text: "Rendi Moderatore", onPress: () => handleAction(user.id, "role", { role: "moderator" }) },
      { text: "Reset Password", onPress: () => {
        Alert.prompt?.("Nuova Password", "Inserisci la nuova password", (pwd: string) => {
          if (pwd && pwd.length >= 6) handleAction(user.id, "reset-password", { newPassword: pwd });
        }) || handleAction(user.id, "reset-password", { newPassword: "BikerLink123!" });
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.search} placeholder="Cerca per nickname o email..." placeholderTextColor={Colors.textSecondary} value={search} onChangeText={setSearch} />

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={users}
          renderItem={({ item }) => (
            <Pressable style={styles.userCard} onPress={() => showActions(item)}>
              <Ionicons name="person-circle" size={36} color={item.sex === "male" ? Colors.maleIcon : Colors.femaleIcon} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.nickname}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: item.status === "active" ? Colors.success + "30" : Colors.accentRed + "30" }]}>
                  <Text style={[styles.badgeText, { color: item.status === "active" ? Colors.success : Colors.accentRed }]}>{item.status}</Text>
                </View>
                {item.role !== "user" && (
                  <View style={[styles.badge, { backgroundColor: Colors.accent + "30" }]}>
                    <Text style={[styles.badgeText, { color: Colors.accent }]}>{item.role}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          scrollEnabled={users.length > 0}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  search: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, padding: 12, margin: 16, fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  userCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  userEmail: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  badges: { gap: 4 },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});
