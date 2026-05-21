import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getCountryFlag, getCountryName } from "@/lib/countries-regions";
import { getUserColor, getUserIcon, getUserTypeLabel } from "@/components/map/userDetailUtils";
import UserStatusBadges from "@/components/map/UserStatusBadges";
import UserInfoCards from "@/components/map/UserInfoCards";
import UserPhotoStrip from "@/components/map/UserPhotoStrip";
import UserGarage from "@/components/map/UserGarage";
import UserProposals from "@/components/map/UserProposals";
import UserActionRow from "@/components/map/UserActionRow";

type Props = {
  selectedUser: any;
  selectedUserDetail: any;
  selectedUserProposals: any[];
  detailLoading: boolean;
  onClose: () => void;
  onPhotoPress: (uri: string) => void;
  myOrganizedEvents: any[];
  onInvitePress: () => void;
};

export default function UserDetailContent({
  selectedUser,
  selectedUserDetail,
  selectedUserProposals,
  detailLoading,
  onClose,
  onPhotoPress,
  myOrganizedEvents,
  onInvitePress,
}: Props) {
  const t = useT();

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
      <View style={styles.header}>
        <Ionicons
          name={getUserIcon(selectedUser)}
          size={32}
          color={getUserColor(selectedUser)}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{selectedUser?.nickname}</Text>
          <Text style={styles.type}>{getUserTypeLabel(selectedUser, t)}</Text>
          {(selectedUser?.country || selectedUser?.region) && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.locationText}>
                {[
                  selectedUser?.region || null,
                  selectedUser?.country
                    ? `${getCountryFlag(selectedUser.country)} ${getCountryName(selectedUser.country)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </View>
          )}
          <UserStatusBadges userDetail={selectedUserDetail} />
        </View>
        <Pressable onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </Pressable>
      </View>

      {selectedUserDetail?.bio && (
        <Text style={styles.bio}>{selectedUserDetail.bio}</Text>
      )}

      <UserInfoCards userDetail={selectedUserDetail} onClose={onClose} />

      <UserPhotoStrip
        photos={selectedUserDetail?.photos ?? []}
        onPhotoPress={onPhotoPress}
      />

      <UserGarage motorcycles={selectedUserDetail?.motorcycles ?? []} />

      <UserProposals
        proposals={selectedUserProposals}
        detailLoading={detailLoading}
        onClose={onClose}
      />

      <UserActionRow
        selectedUser={selectedUser}
        myOrganizedEvents={myOrganizedEvents}
        onClose={onClose}
        onInvitePress={onInvitePress}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  name: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.text },
  type: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  locationText: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 12 },
});
