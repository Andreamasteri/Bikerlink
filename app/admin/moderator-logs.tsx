import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

interface ModeratorLog {
  id: string;
  moderatorId: string;
  moderatorNickname: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetUserNickname: string | null;
  details: string | null;
  createdAt: string;
}

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  view_profile: { icon: "eye-outline", color: Colors.accent },
  create_advertisement: { icon: "plus-circle-outline", color: Colors.success },
  update_advertisement: { icon: "pencil-outline", color: Colors.warning },
  ban_user: { icon: "account-cancel-outline", color: Colors.error },
  unban_user: { icon: "account-check-outline", color: Colors.success },
  approve_photo: { icon: "check-circle-outline", color: Colors.success },
  reject_photo: { icon: "close-circle-outline", color: Colors.error },
};

const webTopInset = Platform.OS === "web" ? 67 : 0;
const webBottomInset = Platform.OS === "web" ? 34 : 0;

function LogRow({ log }: { log: ModeratorLog }) {
  const iconInfo = ACTION_ICONS[log.action] ?? { icon: "information-outline", color: Colors.textSecondary };
  const dateStr = new Date(log.createdAt).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, { backgroundColor: iconInfo.color + "18" }]}>
        <MaterialCommunityIcons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
      </View>
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.modName}>{log.moderatorNickname}</Text>
          <Text style={styles.action}>{log.action.replace(/_/g, " ")}</Text>
        </View>
        {log.targetUserNickname ? (
          <Text style={styles.target}>→ {log.targetUserNickname}</Text>
        ) : log.targetId ? (
          <Text style={styles.target}>→ {log.targetType}: {log.targetId.slice(0, 8)}…</Text>
        ) : null}
        {log.details ? (
          <Text style={styles.details} numberOfLines={2}>{log.details}</Text>
        ) : null}
        <Text style={styles.date}>{dateStr}</Text>
      </View>
    </View>
  );
}

export default function AdminModeratorLogs() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data: logs = [], isLoading } = useQuery<ModeratorLog[]>({
    queryKey: ["/api/admin/moderator-logs"],
  });

  const filtered = search.trim()
    ? logs.filter((l) =>
        l.moderatorNickname.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        (l.targetUserNickname ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (l.details ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: webBottomInset }]}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={Colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Cerca moderatore, azione, utente…"
          placeholderTextColor={Colors.textSecondary}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="shield-account-outline" size={56} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>{search ? "Nessun risultato" : "Nessun log disponibile"}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => <LogRow log={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.count}>{filtered.length} log{filtered.length !== 1 ? "s" : ""}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    margin: 16,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  count: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  rowContent: { flex: 1, gap: 3 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  modName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  action: {
    fontSize: 12,
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  target: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  details: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  date: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
});
