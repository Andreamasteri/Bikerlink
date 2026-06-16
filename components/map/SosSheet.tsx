import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { useLocale } from "@/lib/language-context";

type SosRequest = {
  id: string;
  requesterId: string;
  requesterNickname: string;
  reason: string;
  createdAt: string;
  radiusKm?: number;
  latitude?: number;
  longitude?: number;
};

type Props = {
  activeSosRequests: SosRequest[];
  currentUserId: string | null | undefined;
  showDetail: boolean;
  onOpenDetail: () => void;
  onCloseDetail: () => void;
  onAccept: (id: string) => void;
  accepting: boolean;
};

export default function SosSheet({
  activeSosRequests,
  currentUserId,
  showDetail,
  onOpenDetail,
  onCloseDetail,
  onAccept,
  accepting,
}: Props) {
  const t = useT();
  const locale = useLocale();
  const colors = useColors();
  const styles = makeStyles(colors);

  const othersRequests = activeSosRequests.filter((r) => r.requesterId !== currentUserId);

  if (activeSosRequests.length === 0 && !showDetail) return null;

  return (
    <>
      {activeSosRequests.length > 0 && (
        <Pressable style={styles.floatingIndicator} onPress={onOpenDetail}>
          <Ionicons name="warning" size={28} color={colors.warning} />
          <Text style={styles.overlayLabel}>{t("home.sosActive")}</Text>
        </Pressable>
      )}

      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={onCloseDetail}>
        <Pressable style={styles.overlay} onPress={onCloseDetail}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Pressable style={styles.closeBtn} onPress={onCloseDetail}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <Image
                source={require("@/assets/images/sos-accept-icon.png")}
                style={[styles.icon, { tintColor: colors.primary }]}
                resizeMode="contain"
              />
              <Text style={styles.title}>Richiesta di Soccorso</Text>
            </View>
            {othersRequests.length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                {othersRequests.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.row}>
                      <Ionicons name="person" size={18} color={colors.accent} />
                      <Text style={styles.name}>{r.requesterNickname}</Text>
                    </View>
                    <View style={styles.row}>
                      <Ionicons name="alert-circle" size={18} color={colors.error} />
                      <Text style={styles.reason}>{r.reason}</Text>
                    </View>
                    <View style={styles.row}>
                      <Ionicons name="time" size={18} color={colors.textSecondary} />
                      <Text style={styles.time}>
                        {new Date(r.createdAt).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {r.radiusKm ? `  •  ${t("home.radius")}: ${r.radiusKm} km` : ""}
                      </Text>
                    </View>
                    <Pressable
                      style={[styles.acceptBtn, accepting && { opacity: 0.5 }]}
                      onPress={() => onAccept(r.id)}
                      disabled={accepting}
                    >
                      {accepting ? (
                        <ActivityIndicator color={colors.background} size="small" />
                      ) : (
                        <Text style={styles.acceptText}>{t("home.acceptSos")}</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ alignItems: "center", padding: 24 }}>
                <Ionicons name="checkmark-circle-outline" size={40} color={colors.textSecondary} />
                <Text style={styles.noRequests}>{t("home.noRescueRequests")}</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    floatingIndicator: {
      position: "absolute",
      bottom: 16,
      alignSelf: "center",
      backgroundColor: "rgba(0,0,0,0.72)",
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 20,
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      zIndex: 20,
    },
    overlayLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 32,
      maxHeight: "85%",
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: 16,
    },
    closeBtn: {
      position: "absolute",
      top: 16,
      right: 16,
      zIndex: 10,
      padding: 4,
    },
    icon: {
      width: 80,
      height: 80,
      marginBottom: 8,
    },
    title: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.text },
    card: {
      backgroundColor: colors.background,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderLeftWidth: 4,
      borderLeftColor: colors.accent,
      gap: 10,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    name: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.text },
    reason: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.error, flex: 1 },
    time: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.textSecondary },
    acceptBtn: {
      backgroundColor: colors.accent,
      padding: 14,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 6,
    },
    acceptText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.background },
    noRequests: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      marginTop: 8,
    },
  });
}
