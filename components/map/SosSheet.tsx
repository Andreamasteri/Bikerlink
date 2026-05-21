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
import Colors from "@/constants/colors";
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

  if (activeSosRequests.length === 0 && !showDetail) return null;

  return (
    <>
      {activeSosRequests.length > 0 && (
        <Pressable style={styles.floatingIndicator} onPress={onOpenDetail}>
          <View style={styles.warningContainer}>
            <View style={styles.triangleBorder} />
            <View style={styles.triangleFill} />
            <Text style={styles.exclamation}>!</Text>
          </View>
          <Text style={styles.overlayLabel}>{t("home.sosActive")}</Text>
        </Pressable>
      )}

      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={onCloseDetail}>
        <Pressable style={styles.overlay} onPress={onCloseDetail}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Pressable style={styles.closeBtn} onPress={onCloseDetail}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
            <View style={{ alignItems: "center", marginBottom: 20 }}>
              <Image
                source={require("@/assets/images/sos-accept-icon.png")}
                style={styles.icon}
                resizeMode="contain"
              />
              <Text style={styles.title}>Richiesta di Soccorso</Text>
            </View>
            {activeSosRequests.filter((r) => r.requesterId !== currentUserId).length > 0 ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
                {activeSosRequests
                  .filter((r) => r.requesterId !== currentUserId)
                  .map((r) => (
                    <View key={r.id} style={styles.card}>
                      <View style={styles.row}>
                        <Ionicons name="person" size={18} color="#003399" />
                        <Text style={styles.name}>{r.requesterNickname}</Text>
                      </View>
                      <View style={styles.row}>
                        <Ionicons name="alert-circle" size={18} color="#CC0000" />
                        <Text style={styles.reason}>{r.reason}</Text>
                      </View>
                      <View style={styles.row}>
                        <Ionicons name="time" size={18} color={Colors.textSecondary} />
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
                          <ActivityIndicator color="#FFFFFF" size="small" />
                        ) : (
                          <Text style={styles.acceptText}>{t("home.acceptSos")}</Text>
                        )}
                      </Pressable>
                    </View>
                  ))}
              </ScrollView>
            ) : (
              <View style={{ alignItems: "center", padding: 24 }}>
                <Ionicons name="checkmark-circle-outline" size={40} color={Colors.textSecondary} />
                <Text style={styles.noRequests}>{t("home.noRescueRequests")}</Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  warningContainer: {
    width: 100,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  triangleBorder: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 52,
    borderRightWidth: 52,
    borderBottomWidth: 92,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
  },
  triangleFill: {
    position: "absolute",
    top: 10,
    width: 0,
    height: 0,
    borderLeftWidth: 44,
    borderRightWidth: 44,
    borderBottomWidth: 78,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FF3300",
  },
  exclamation: {
    position: "absolute",
    bottom: 6,
    fontSize: 40,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
  overlayLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
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
    tintColor: "#003399",
    marginBottom: 8,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#003399" },
  card: {
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#003399",
    gap: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: Colors.text },
  reason: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#CC0000", flex: 1 },
  time: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  acceptBtn: {
    backgroundColor: "#003399",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  acceptText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  noRequests: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 8,
  },
});
