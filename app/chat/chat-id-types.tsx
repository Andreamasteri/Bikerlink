import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "@/app/chat/chat-id-styles";

export interface ConversationDetail {
  id: string;
  conversationType: string;
  title: string | null;
  participants: Array<{
    id: string;
    nickname: string;
    avatarUrl: string | null;
    userType: string;
  }>;
}

export interface MotoClub {
  id: string;
  name: string;
  conversationId: string | null;
}

export function parseHashtagsFromInput(input: string): string[] {
  return input
    .split(/\s+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.startsWith("#") && w.length > 1);
}

export function messageMatchesHashtags(content: string | null, hashtags: string[]): boolean {
  if (!content || hashtags.length === 0) return true;
  const lower = content.toLowerCase();
  return hashtags.some((tag) => lower.includes(tag));
}

export function MotoclubWelcomeBanner() {
  return (
    <View style={styles.welcomeBanner}>
      <Ionicons name="information-circle" size={18} color={Colors.accent} />
      <Text style={styles.welcomeText}>
        Usa gli hashtag della tua regione per organizzare i messaggi del club.{"\n"}
        <Text style={{ color: Colors.accent, fontFamily: "Inter_600SemiBold" }}>Esempio: #veneto #lombardia</Text>
      </Text>
    </View>
  );
}
