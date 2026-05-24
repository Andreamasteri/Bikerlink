import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";
import { useT } from "@/lib/language-context";
import { UserClub } from "./MotoClubCard";

export type MarketplaceMoto = {
  id: string;
  brand: string;
  model: string;
  displacement?: number | null;
  motorcycleType?: string;
  saleDescription?: string | null;
  seller: {
    id: string;
    nickname: string;
    avatarUrl?: string | null;
  };
};

interface MotoClubMarketplaceProps {
  myClubs: UserClub[];
  marketplaceMotos: MarketplaceMoto[];
  onRefresh: () => void;
  bottomInset: number;
}

export const MotoClubMarketplace: React.FC<MotoClubMarketplaceProps> = ({
  myClubs,
  marketplaceMotos,
  onRefresh,
  bottomInset,
}) => {
  const t = useT();
  const router = useRouter();
  const totalMotos = marketplaceMotos.length;

  return (
    <FlatList
      data={marketplaceMotos}
      keyExtractor={(m) => m.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + bottomInset }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.accent} />}
      ListHeaderComponent={
        totalMotos > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Ionicons name="pricetag" size={18} color="#FF9800" />
            <Text style={{ fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>
              {totalMotos} {t("motoclub.motosForSale")}
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="pricetag-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>
            {myClubs.length === 0
              ? t("motoclub.joinClubToSeeMarket")
              : t("motoclub.noMotoForSale")}
          </Text>
        </View>
      }
      renderItem={({ item: moto }) => (
        <TouchableOpacity
          style={styles.marketCard}
          activeOpacity={0.7}
          onPress={() => router.push(`/profile/${moto.seller.id}` as never)}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceLight, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="bicycle" size={20} color="#FF9800" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text }}>
                {moto.brand} {moto.model}
                {moto.displacement ? ` (${moto.displacement}cc)` : ""}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 }}>
                di {moto.seller.nickname}
              </Text>
              {!!moto.saleDescription && (
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, fontStyle: "italic", marginTop: 4 }} numberOfLines={2}>
                  {moto.saleDescription}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
          </View>
        </TouchableOpacity>
      )}
    />
  );
};

const styles = StyleSheet.create({
  marketCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#FF9800",
  },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
});
