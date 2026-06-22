import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { AdminUser, UserCard } from "@/components/admin/users/UserCard";
import { BackupBanner, BackupUserDetailModal } from "./backup-preview.part2";
import { styles } from "./backup-preview.styles";

export interface BackupSummaryItem {
  table: string;
  label: string;
  count: number;
}

export interface BackupUser {
  user: string;
  email: string;
  password: string;
  country: string;
  [key: string]: unknown;
}

interface BackupPreviewResponse {
  summary: BackupSummaryItem[];
  records: {
    users?: BackupUser[];
    motoclubs?: unknown[];
    eventi?: unknown[];
    [key: string]: unknown[] | undefined;
  };
}

function formatLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function backupUserToAdminUser(u: BackupUser, index: number): AdminUser {
  return {
    id: `backup-${index}`,
    nickname: u.user || `Utente ${index + 1}`,
    email: u.email || "—",
    phone: undefined,
    userType: "backup",
    role: "user",
    status: "active",
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    lastAppVersion: null,
    lastPlatform: null,
    lastDeviceModel: null,
    isFake: false,
    isPrimal: false,
    hasLastfmData: false,
    mapTester: false,
  };
}

function readOnlyAlert() {
  Alert.alert("Sola lettura", "Questi sono dati di backup — nessuna modifica è consentita.");
}

export default function BackupPreviewScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<"overview" | "users">("overview");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<BackupPreviewResponse>({
    queryKey: ["/api/admin/backup-preview"],
    queryFn: async () => {
      const url = new URL("/api/admin/backup-preview", getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const backupUsers = (data?.records?.users ?? []) as BackupUser[];
  const adminUsers: AdminUser[] = backupUsers.map(backupUserToAdminUser);

  function openUser(index: number) {
    setSelectedIndex(index);
    setModalVisible(true);
  }

  const selectedBackupUser = selectedIndex !== null ? backupUsers[selectedIndex] ?? null : null;
  const selectedAdminUser = selectedIndex !== null ? adminUsers[selectedIndex] ?? null : null;

  if (view === "users") {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View style={styles.subHeader}>
          <TouchableOpacity
            onPress={() => setView("overview")}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.accent} />
            <Text style={styles.backBtnText}>Panoramica</Text>
          </TouchableOpacity>
          <Text style={styles.subHeaderTitle}>Utenti ({adminUsers.length})</Text>
        </View>

        <FlatList
          data={adminUsers}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item, index }) => (
            <UserCard
              item={item}
              onOpenStats={() => openUser(index)}
              onOpenEdit={readOnlyAlert}
              onStatusChange={readOnlyAlert}
              onMakeModerator={readOnlyAlert}
              onClearLastfm={readOnlyAlert}
              onDeleteUser={readOnlyAlert}
              onTogglePrimal={readOnlyAlert}
              onToggleMapTester={readOnlyAlert}
            />
          )}
          ListHeaderComponent={
            <View style={{ paddingBottom: 8 }}>
              <BackupBanner />
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="database-off-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessun utente nel backup</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16 }}
        />

        <BackupUserDetailModal
          visible={modalVisible}
          user={selectedBackupUser}
          adminUser={selectedAdminUser}
          onClose={() => setModalVisible(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <BackupBanner />

        <Text style={styles.pageTitle}>Contenuto Backup</Text>

        {isLoading && (
          <Text style={styles.loadingText}>Caricamento dati backup…</Text>
        )}

        {isError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Errore durante il caricamento del backup.</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && data && (
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 2 }]}>Sezione</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, { flex: 1, textAlign: "right" }]}>Record</Text>
              <Text style={[styles.tableCell, styles.tableCellHeader, { width: 80, textAlign: "right" }]}>Azione</Text>
            </View>

            {data.summary.map((item) => {
              const canDrill = item.table === "users" && item.count > 0;
              return (
                <View key={item.table} style={styles.tableRow}>
                  <View style={[styles.tableCell, { flex: 2, flexDirection: "row", alignItems: "center", gap: 8 }]}>
                    <MaterialCommunityIcons
                      name={
                        item.table === "users"
                          ? "account-multiple"
                          : item.table === "motoclubs"
                          ? "shield-outline"
                          : "calendar-outline"
                      }
                      size={18}
                      color={Colors.accent}
                    />
                    <Text style={styles.tableCellText}>{formatLabel(item.label)}</Text>
                  </View>
                  <Text style={[styles.tableCell, styles.tableCellCount, { flex: 1, textAlign: "right" }]}>
                    {item.count}
                  </Text>
                  <View style={[styles.tableCell, { width: 80, alignItems: "flex-end" }]}>
                    {canDrill ? (
                      <TouchableOpacity style={styles.drillBtn} onPress={() => setView("users")}>
                        <Text style={styles.drillBtnText}>Vedi</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.drillNa}>—</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!isLoading && !isError && data && data.summary.every((s) => s.count === 0) && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="database-off-outline" size={40} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessun dato trovato nei file di backup.</Text>
            <Text style={styles.emptySubText}>
              Popola i file in server/data/backup/ per visualizzare il contenuto.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
