import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/colors';
import { useT } from '@/lib/language-context';

interface BlacklistCardProps {
  item: any;
  onUnblock: (id: string) => void;
}

export const BlacklistCard: React.FC<BlacklistCardProps> = ({ item, onUnblock }) => {
  const t = useT();
  return (
    <View style={styles.matchCard}>
      <View style={styles.matchUserInfo}>
        <View style={styles.blacklistAvatarPlaceholder}>
          <Ionicons name="person" size={24} color={Colors.textSecondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.matchNickname}>{item.nickname || t("common.anonymous")}</Text>
          <Text style={styles.matchUserType}>{t("match.blockedUser")}</Text>
        </View>
        <TouchableOpacity onPress={() => onUnblock(item.id)} style={styles.distanceKmApplyBtn}>
          <Text style={styles.distanceKmApplyText}>{t("match.unblock")}</Text>
        </TouchableOpacity>
      </View>
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
  matchUserInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  blacklistAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
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
  distanceKmApplyBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  distanceKmApplyText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
});
