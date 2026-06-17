import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/query-client";
import type { UserSummary, UserDetail, Proposal, OrganizedEvent } from "@/components/map/userDetailTypes";

type Props = {
  selectedUser: UserSummary;
  selectedUserDetail: UserDetail | null;
  selectedUserProposals: Proposal[];
  detailLoading: boolean;
  onClose: () => void;
  onPhotoPress: (uri: string) => void;
  myOrganizedEvents: OrganizedEvent[];
  onInvitePress: () => void;
};

interface ReverseGeocodeResult {
  displayName: string;
  road: string | null;
  suburb: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  country: string | null;
}

function formatAddress(r: ReverseGeocodeResult): string | null {
  const place = r.town ?? r.city ?? r.county ?? null;
  if (r.road && place) return `${r.road}, ${place}`;
  if (r.road) return r.road;
  if (place) return place;
  return null;
}

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

  const lat = selectedUser?.latitude != null ? Number(selectedUser.latitude) : null;
  const lon = selectedUser?.longitude != null ? Number(selectedUser.longitude) : null;
  const hasCoords = lat != null && lon != null && !isNaN(lat) && !isNaN(lon);

  const { data: addressData, isLoading: addressLoading } = useQuery<ReverseGeocodeResult>({
    queryKey: ["/api/geocode/reverse", lat, lon],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/geocode/reverse?lat=${lat}&lon=${lon}&zoom=10`);
      return res.json();
    },
    enabled: hasCoords,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  const addressText = addressData ? formatAddress(addressData) : null;

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
          {hasCoords && (
            addressLoading ? (
              <View style={styles.addressSkeleton} />
            ) : addressText ? (
              <View style={styles.locationRow}>
                <Ionicons name="navigate-outline" size={12} color={Colors.textSecondary} />
                <Text style={styles.addressText} numberOfLines={1}>{addressText}</Text>
              </View>
            ) : null
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
  addressText: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular", flex: 1 },
  addressSkeleton: {
    marginTop: 4,
    height: 10,
    width: 120,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },
  bio: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 12 },
});
