import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,

} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

type HubCard = {
  key: string;
  title: string;
  description: string;
  route: string;
  accentColor: string;
  icon: React.ReactNode;
};

export default function SensorsHub() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const cards: HubCard[] = [
    {
      key: "raw",
      title: "Dati Grezzi",
      description:
        t("admin.sensorsDesc"),
      route: "/admin/sensors/raw",
      accentColor: Colors.accent,
      icon: (
        <MaterialCommunityIcons name="chip" size={32} color={Colors.accent} />
      ),
    },
    {
      key: "final",
      title: "Dati Finali",
      description:
        "Elaborazioni DeviceMotion: accelerazione G, frenata, forza laterale e angolo di inclinazione. Attiva singolarmente solo i valori che vuoi monitorare.",
      route: "/admin/sensors/final",
      accentColor: "#FF9800",
      icon: (
        <Ionicons name="analytics-outline" size={32} color="#FF9800" />
      ),
    },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: insets.bottom + 24,
          paddingTop: 16,
        },
      ]}
    >
      <View style={styles.headerNote}>
        <Ionicons name="flask-outline" size={16} color={Colors.textSecondary} />
        <Text style={styles.headerNoteText}>
          Area diagnostica — nessun dato viene inviato al server
        </Text>
      </View>

      {cards.map((card) => (
        <TouchableOpacity
          key={card.key}
          style={styles.card}
          onPress={() => router.push(card.route as never)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconBox, { backgroundColor: card.accentColor + "18" }]}>
            {card.icon}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardDesc}>{card.description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 14,
  },
  headerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  headerNoteText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 19,
  },
});
