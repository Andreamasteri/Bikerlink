import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { AdminUser, UserCard } from "@/components/admin/users/UserCard";

interface BackupSummaryItem {
  table: string;
  label: string;
  count: number;
}

interface BackupUser {
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

function BackupBanner() {
  return (
    <View style={styles.banner}>
      <Ionicons name="warning-outline" size={18} color="#92400E" style={{ marginRight: 8 }} />
      <Text style={styles.bannerText}>
        Anteprima backup — dati non presenti nel database
      </Text>
    </View>
  );
}

function BackupUserDetailModal({
  visible,
  user,
  adminUser,
  onClose,
}: {
  visible: boolean;
  user: BackupUser | null;
  adminUser: AdminUser | null;
  onClose: () => void;
}) {
  if (!user || !adminUser) return null;

  const extraFields = Object.entries(user).filter(
    ([k]) => !["user", "email", "password", "country"].includes(k)
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "formSheet" : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{adminUser.nickname}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        >
          <View style={{ marginTop: 12 }}>
            <BackupBanner />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profilo Backup</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Nickname / Username</Text>
              <Text style={styles.value}>{user.user || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{user.email || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Password (testo chiaro)</Text>
              <Text style={[styles.value, styles.passwordText]}>{user.password || "—"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Paese selezionato</Text>
              <Text style={styles.value}>{user.country || "—"}</Text>
            </View>
          </View>

          {extraFields.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Campi Aggiuntivi</Text>
              {extraFields.map(([k, v]) => (
                <View key={k} style={styles.row}>
                  <Text style={styles.label}>{k}</Text>
                  <Text style={styles.value} numberOfLines={3}>
                    {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  bannerText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#92400E",
    flex: 1,
  },
  pageTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
    marginBottom: 16,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
  errorBox: {
    backgroundColor: Colors.error + "22",
    borderWidth: 1,
    borderColor: Colors.error + "55",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.error,
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: Colors.error,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  tableContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceLight ?? Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    alignItems: "center",
  },
  tableCell: {
    justifyContent: "center",
  },
  tableCellHeader: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableCellText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  tableCellCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  drillBtn: {
    backgroundColor: Colors.accent + "22",
    borderWidth: 1,
    borderColor: Colors.accent + "66",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  drillBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
  },
  drillNa: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  emptySubText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 12,
  },
  backBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.accent,
  },
  subHeaderTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.accent,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  value: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
    textAlign: "right",
  },
  passwordText: {
    fontFamily: "Inter_700Bold",
    color: Colors.error,
  },
});
