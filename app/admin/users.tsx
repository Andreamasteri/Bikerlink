import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";

interface AdminUser {
  id: string;
  nickname: string;
  email: string;
  userType: string;
  role: string;
  status: string;
  createdAt: string;
}

export default function AdminUsers() {
  const insets = useSafeAreaInsets();

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${id}/role`, { role });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  function handleStatusChange(user: AdminUser) {
    const options = ["active", "suspended", "blocked"].filter((s) => s !== user.status);
    Alert.alert("Cambia stato", `Utente: ${user.nickname}`, [
      ...options.map((status) => ({
        text: status.charAt(0).toUpperCase() + status.slice(1),
        onPress: () => statusMutation.mutate({ id: user.id, status }),
      })),
      { text: "Annulla", style: "cancel" as const },
    ]);
  }

  function handleRoleChange(user: AdminUser) {
    const options = ["user", "moderator", "admin"].filter((r) => r !== user.role);
    Alert.alert("Cambia ruolo", `Utente: ${user.nickname}`, [
      ...options.map((role) => ({
        text: role.charAt(0).toUpperCase() + role.slice(1),
        onPress: () => roleMutation.mutate({ id: user.id, role }),
      })),
      { text: "Annulla", style: "cancel" as const },
    ]);
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "active": return Colors.dark.success;
      case "suspended": return Colors.dark.warning;
      case "blocked": return Colors.dark.error;
      default: return Colors.dark.textSecondary;
    }
  }

  function getRoleColor(role: string) {
    switch (role) {
      case "admin": return Colors.dark.accent;
      case "moderator": return Colors.dark.azzurro;
      default: return Colors.dark.textSecondary;
    }
  }

  function renderUser({ item }: { item: AdminUser }) {
    return (
      <View style={styles.card}>
        <View style={styles.userInfo}>
          <Text style={styles.nickname}>{item.nickname}</Text>
          <Text style={styles.email}>{item.email}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) + "33" }]}>
              <Text style={[styles.badgeText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: getRoleColor(item.role) + "33" }]}>
              <Text style={[styles.badgeText, { color: getRoleColor(item.role) }]}>{item.role}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: Colors.dark.surfaceLight }]}>
              <Text style={[styles.badgeText, { color: Colors.dark.textSecondary }]}>{item.userType}</Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => handleStatusChange(item)}>
            <MaterialIcons name="block" size={22} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRoleChange(item)}>
            <MaterialIcons name="admin-panel-settings" size={22} color={Colors.dark.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoading ? (
        <Text style={styles.loadingText}>Caricamento...</Text>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderUser}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, padding: 16 }}
          ListEmptyComponent={<Text style={styles.emptyText}>Nessun utente</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  userInfo: { flex: 1 },
  nickname: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.dark.text },
  email: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.dark.textSecondary, marginTop: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  actions: { flexDirection: "row", gap: 16 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", marginTop: 40 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.dark.textSecondary, textAlign: "center", marginTop: 40 },
});
