import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import type { ProfileData } from "@/components/profile/types";

interface ProfileHeaderProps {
  profile: ProfileData | undefined;
  user: any;
  typeColor: string;
  avatarSource: any;
  isUploading: boolean;
  onPickImage: () => void;
  getUserTypeIcon: (userType: string) => keyof typeof Ionicons.glyphMap;
  currentUserType: string;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  profile,
  user,
  typeColor,
  avatarSource,
  isUploading,
  onPickImage,
  getUserTypeIcon,
  currentUserType,
}) => {
  return (
    <View style={styles.profileHeader}>
      <TouchableOpacity onPress={onPickImage} activeOpacity={0.8}>
        <View style={[styles.avatar, { borderColor: typeColor }]}>
          {avatarSource ? (
            <Image source={avatarSource} style={styles.avatarImage} />
          ) : (
            <Ionicons name={getUserTypeIcon(currentUserType)} size={48} color={typeColor} />
          )}
        </View>
      </TouchableOpacity>
      {isUploading && (
        <ActivityIndicator size="small" color={Colors.accent} style={{ marginTop: 8 }} />
      )}
      <Text style={styles.nickname}>{profile?.nickname ?? user?.nickname ?? ""}</Text>
      {profile?.isPrimal === true && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Ionicons name="star" size={14} color="#FF3B30" />
          <Text style={{ fontSize: 12, fontWeight: "bold" as const, color: "#FF3B30", fontFamily: "Inter_700Bold" }}>Primal</Text>
        </View>
      )}
      {(!!profile?.region || !!profile?.country) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
          <Text style={{ fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular" }}>
            {[
              profile?.region || null,
              profile?.country ? `${getCountryFlag(profile.country)} ${getCountryName(profile.country)}` : null,
            ].filter(Boolean).join(", ")}
          </Text>
        </View>
      )}
      {!!profile?.profile?.bio && (
        <Text style={{ fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4, marginBottom: 4, paddingHorizontal: 16 }}>
          {profile.profile.bio}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  profileHeader: {
    alignItems: "center",
    padding: 16,
    paddingTop: 6,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  nickname: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 12,
  },
});
