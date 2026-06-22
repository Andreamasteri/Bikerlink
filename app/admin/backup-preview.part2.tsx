import React from "react";
import { View, Text, Modal, Platform, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./backup-preview.styles";
import type { BackupUser } from "./backup-preview";
import type { AdminUser } from "@/components/admin/users/UserCard";

export function BackupBanner() {
  return (
    <View style={styles.banner}>
      <Ionicons name="warning-outline" size={18} color="#92400E" style={{ marginRight: 8 }} />
      <Text style={styles.bannerText}>
        Anteprima backup — dati non presenti nel database
      </Text>
    </View>
  );
}

export function BackupUserDetailModal({
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
