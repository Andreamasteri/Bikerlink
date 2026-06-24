import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

interface BusinessDTO {
  id: string;
  type: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  promoText: string | null;
  eventUrl: string | null;
  logoUrl: string | null;
}

function trackClick(businessId: string, actionType: string): void {
  apiRequest("POST", `/api/businesses/${businessId}/click`, { actionType }).catch(() => {
    // best-effort: una conversione persa non deve bloccare l'azione utente
  });
}

export default function BusinessDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: business, isLoading, error } = useQuery<BusinessDTO>({
    queryKey: ["/api/businesses", id],
    enabled: !!id,
  });

  const isDealer = business?.type === "concessionaria";
  const accent = isDealer ? "#1565C0" : "#AD1457";

  const handleDirections = () => {
    if (!business?.latitude || !business?.longitude) return;
    trackClick(business.id, "directions");
    const lat = business.latitude;
    const lon = business.longitude;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${lat},${lon}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`,
    });
    if (url) Linking.openURL(url).catch(() => undefined);
  };

  const handleCall = () => {
    if (!business?.phone) return;
    trackClick(business.id, "call");
    Linking.openURL(`tel:${business.phone}`).catch(() => undefined);
  };

  const handleWhatsapp = () => {
    if (!business?.whatsapp) return;
    trackClick(business.id, "whatsapp");
    const num = business.whatsapp.replace(/[^\d+]/g, "");
    Linking.openURL(`https://wa.me/${num}`).catch(() => undefined);
  };

  const handleEvent = () => {
    if (!business?.eventUrl) return;
    trackClick(business.id, "event");
    WebBrowser.openBrowserAsync(business.eventUrl).catch(() => undefined);
  };

  const handleWebsite = () => {
    if (!business?.website) return;
    trackClick(business.id, "website");
    const url = business.website.startsWith("http") ? business.website : `https://${business.website}`;
    WebBrowser.openBrowserAsync(url).catch(() => undefined);
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={accent} size="large" />
      </View>
    );
  }

  if (error || !business) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topInset }]}>
        <Text style={styles.errorText}>{t("business.notFound") || "Business non trovato"}</Text>
        <Pressable style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t("common.back") || "Indietro"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingTop: topInset + 8, paddingBottom: bottomInset + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Ionicons name={isDealer ? "car-sport" : "storefront"} size={28} color="#fff" />
          </View>
          <Text style={styles.name}>{business.name}</Text>
          <Text style={[styles.type, { color: accent }]}>
            {isDealer ? (t("business.dealer") || "Concessionaria") : (t("business.venue") || "Locale")}
          </Text>
          {business.address ? <Text style={styles.address}>{business.address}</Text> : null}
        </View>

        {business.promoText ? (
          <View style={[styles.promoCard, { borderLeftColor: accent }]}>
            <Ionicons name="megaphone" size={18} color={accent} />
            <Text style={styles.promoText}>{business.promoText}</Text>
          </View>
        ) : null}

        {business.description ? (
          <Text style={styles.description}>{business.description}</Text>
        ) : null}

        <View style={styles.actions}>
          {business.latitude != null && business.longitude != null ? (
            <Pressable style={[styles.actionBtn, { backgroundColor: accent }]} onPress={handleDirections}>
              <Ionicons name="navigate" size={20} color="#fff" />
              <Text style={styles.actionText}>{t("business.directions") || "Indicazioni"}</Text>
            </Pressable>
          ) : null}
          {business.phone ? (
            <Pressable style={[styles.actionBtn, { backgroundColor: accent }]} onPress={handleCall}>
              <Ionicons name="call" size={20} color="#fff" />
              <Text style={styles.actionText}>{t("business.call") || "Chiama"}</Text>
            </Pressable>
          ) : null}
          {business.whatsapp ? (
            <Pressable style={[styles.actionBtn, { backgroundColor: "#25D366" }]} onPress={handleWhatsapp}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.actionText}>WhatsApp</Text>
            </Pressable>
          ) : null}
          {business.eventUrl ? (
            <Pressable style={[styles.actionBtn, { backgroundColor: accent }]} onPress={handleEvent}>
              <Ionicons name="calendar" size={20} color="#fff" />
              <Text style={styles.actionText}>{t("business.event") || "Evento"}</Text>
            </Pressable>
          ) : null}
          {business.website ? (
            <Pressable style={[styles.actionBtn, styles.actionBtnOutline]} onPress={handleWebsite}>
              <Ionicons name="globe" size={20} color={accent} />
              <Text style={[styles.actionText, { color: accent }]}>{t("business.website") || "Sito web"}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  errorText: { color: Colors.text, fontSize: 16 },
  headerRow: { flexDirection: "row", paddingHorizontal: 12, marginBottom: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  heroCard: { alignItems: "center", paddingHorizontal: 24, marginBottom: 16 },
  badge: {
    width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  name: { color: Colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  type: { fontSize: 14, fontWeight: "600", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  address: { color: Colors.textSecondary, fontSize: 14, marginTop: 8, textAlign: "center" },
  promoCard: {
    flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 16,
    padding: 14, borderRadius: 12, backgroundColor: Colors.surface, borderLeftWidth: 4,
  },
  promoText: { color: Colors.text, fontSize: 14, flex: 1, fontWeight: "500" },
  description: { color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginHorizontal: 24, marginBottom: 20 },
  actions: { paddingHorizontal: 16, gap: 12 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    paddingVertical: 16, borderRadius: 14,
  },
  actionBtnOutline: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: Colors.border },
  actionText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.surface },
  backBtnText: { color: Colors.text, fontSize: 15, fontWeight: "600" },
});
