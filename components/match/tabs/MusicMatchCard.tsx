import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useT } from '@/lib/language-context';
import { useRouter } from 'expo-router';

interface MusicMatchItem {
  songsInCommon?: number;
  genresInCommon?: string[];
  commonGenres?: string[];
  user?: { id?: string; nickname?: string; userType?: string };
}
interface MusicMatchCardProps {
  item: MusicMatchItem;
  onSendMessage: (userId: string) => void;
}

export const MusicMatchCard: React.FC<MusicMatchCardProps> = ({ item, onSendMessage }) => {
  const t = useT();
  const router = useRouter();

  const otherUser = item.user;
  const otherUserId = otherUser?.id;
  const otherNickname = otherUser?.nickname || "Biker";
  const otherType = otherUser?.userType || "biker";
  const otherColor = otherType === "biker" ? Colors.maleIcon : Colors.femaleIcon;

  return (
    <View style={styles.matchCard}>
      <TouchableOpacity
        style={styles.matchUserRow}
        onPress={() => otherUserId && router.push(`/profile/${otherUserId}` as never)}
        activeOpacity={0.7}
      >
        <View style={styles.matchUserInfo}>
          <Ionicons
            name={otherType === "biker" ? "bicycle" : "person"}
            size={28}
            color={otherColor}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.matchNickname, { color: otherColor }]}>{otherNickname}</Text>
            <Text style={styles.matchUserType}>
              {item.songsInCommon} {t("match.songsInCommon")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
        </View>
      </TouchableOpacity>

      {item.commonGenres && item.commonGenres.length > 0 && (
        <View style={{ marginTop: 4, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {item.commonGenres.slice(0, 5).map((g: string) => (
            <View key={g} style={{ backgroundColor: Colors.accent + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}>
              <Text style={{ fontSize: 13, color: Colors.accent, fontFamily: "Inter_500Medium" }}>{g}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.chatBtn, { marginTop: 12 }]}
        onPress={() => otherUserId && onSendMessage(otherUserId)}
      >
        <Ionicons name="chatbubbles" size={18} color={Colors.background} />
        <Text style={styles.chatBtnText}>{t("match.sendMessage")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.accent + "30",
  },
  matchUserRow: {
    marginBottom: 10,
  },
  matchUserInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  matchNickname: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
  },
  matchUserType: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  chatBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
