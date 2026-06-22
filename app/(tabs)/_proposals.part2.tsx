import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./proposals.styles";

export function MatchBanner({ count, onPress, t }: { count: number; onPress: () => void; t: (k: string) => string }) {
  return (
    <TouchableOpacity
      style={styles.matchBannerCard}
      onPress={onPress}
    >
      <Ionicons name="flash" size={20} color={Colors.accent} />
      <Text style={styles.matchBannerText}>
        {count} {t("match.pendingBanner")}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={Colors.accent} />
    </TouchableOpacity>
  );
}

export function ProposalHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name="megaphone" size={18} color={Colors.text} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export const HUB_SECTIONS = [
  { key: "proposte", i18nKey: "proposals.hub.proposalsRequests" },
  { key: "giri", i18nKey: "proposals.hub.ridesPerformance" },
  { key: "percorsi", i18nKey: "proposals.hub.myRoutes" },
  { key: "pianificati", i18nKey: "proposals.hub.myRides" },
] as const;

export const FILTER_KEYS = [
  { key: "all", i18nKey: "proposals.filter.all" },
  { key: "giro", i18nKey: "proposals.filter.bikers" },
  { key: "con_zavorrina", i18nKey: "proposals.filter.passenger" },
  { key: "passaggio_al_volo", i18nKey: "proposals.filter.ride" },
  { key: "richieste", i18nKey: "proposals.filter.requests" },
];

export const SEARCH_TYPE_I18N: Record<string, string> = {
  find_a_friend: "FindAFriend",
  find_a_guest: "proposals.searchType.findPassenger",
  hitcher: "Hitcher",
  hitchhiker: "HitchHiker",
  find_a_biker: "FindABiker"
};

export function getTypeIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string; dual?: boolean } {
  switch (type) {
    case "giro":
    case "find_a_friend": return { name: "people", color: Colors.maleIcon };
    case "con_zavorrina":
    case "find_a_guest": return { name: "bicycle", color: Colors.maleIcon, dual: true };
    case "passaggio_al_volo":
    case "hitcher":
    case "hitchhiker": return { name: "car", color: Colors.success };
    case "richieste": return { name: "thumbs-up", color: Colors.femaleIcon };
    case "find_a_biker": return { name: "bicycle", color: Colors.maleIcon };
    default: return { name: "megaphone", color: Colors.textSecondary };
  }
}

export function getTypeLabelKey(type: string): string {
  switch (type) {
    case "giro":
    case "find_a_friend": return "proposals.type.bikers";
    case "con_zavorrina":
    case "find_a_guest": return "proposals.type.passenger";
    case "passaggio_al_volo":
    case "hitcher":
    case "hitchhiker": return "proposals.type.quickride";
    case "richieste": return "proposals.type.requests";
    case "find_a_biker": return "proposals.type.bikerSearch";
    default: return type;
  }
}
