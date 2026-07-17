import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Linking,

} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";

interface AdCampaign {
  id: string;
  name: string;
  sponsor: string;
  imageUrl: string | null;
  linkUrl: string | null;
  displayMode: string;
  description: string | null;
  isActive: boolean;
  impressions: number;
}

type DisplayMode = "banner" | "card" | "carousel";

interface SynecoAdProps {
  displayMode?: DisplayMode;
  queryKey?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function AdBannerItem({ campaign, onPress }: { campaign: AdCampaign; onPress: () => void }) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    // Cancella l'animazione continua all'unmount: withRepeat(-1) gira per sempre
    // e accumula oggetti nativi (HashMap via ReadableNativeMap.getLocalMap) se
    // non viene fermato esplicitamente — leak di memoria sessione-lunga.
    return () => { cancelAnimation(shimmer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accentStyle = useAnimatedStyle(() => ({
    opacity: 0.6 + shimmer.value * 0.4,
  }));

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.bannerContainer}
    >
      <View style={styles.bannerInner}>
        <View style={styles.bannerIconWrap}>
          <MaterialCommunityIcons
            name="oil"
            size={22}
            color={Colors.accent}
          />
        </View>
        <View style={styles.bannerTextWrap}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {campaign.name}
          </Text>
          <Animated.Text style={[styles.bannerSponsor, accentStyle]}>
            {campaign.sponsor}
          </Animated.Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={Colors.textSecondary}
        />
      </View>
    </TouchableOpacity>
  );
}

function AdCardItem({ campaign, onPress }: { campaign: AdCampaign; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.cardContainer}
    >
      <View style={styles.cardHeader}>
        <MaterialCommunityIcons
          name="oil"
          size={28}
          color={Colors.accent}
        />
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{campaign.name}</Text>
          <Text style={styles.cardSponsor}>{campaign.sponsor}</Text>
        </View>
      </View>
      {campaign.description ? (
        <Text style={styles.cardDescription} numberOfLines={3}>
          {campaign.description}
        </Text>
      ) : null}
      <View style={styles.cardFooter}>
        <View style={styles.cardBadge}>
          <MaterialCommunityIcons
            name="motorbike"
            size={14}
            color={Colors.accent}
          />
          <Text style={styles.cardBadgeText}>Syneco</Text>
        </View>
        <MaterialCommunityIcons
          name="open-in-new"
          size={16}
          color={Colors.maleIcon}
        />
      </View>
    </TouchableOpacity>
  );
}

export default function SynecoAd({ displayMode = "banner", queryKey = "/api/ads/active" }: SynecoAdProps) {
  const { data: campaigns } = useQuery<AdCampaign[]>({
    queryKey: [queryKey],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const clickMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await apiRequest("POST", `/api/ads/${campaignId}/click`);
    },
  });

  const handleAdPress = async (campaign: AdCampaign) => {
    clickMutation.mutate(campaign.id);
    if (campaign.linkUrl) {
      try {
        const canOpen = await Linking.canOpenURL(campaign.linkUrl);
        if (canOpen) {
          await Linking.openURL(campaign.linkUrl);
        }
      } catch {
        // no-op: ignore link opening failures
      }
    }
  };

  if (!campaigns || campaigns.length === 0) {
    return null;
  }

  const filtered = campaigns.filter((c) => {
    if (displayMode === "banner") return true;
    if (displayMode === "card") return true;
    if (displayMode === "carousel") return true;
    return c.displayMode === displayMode;
  });

  if (filtered.length === 0) return null;

  if (displayMode === "banner") {
    const campaign = filtered[0];
    return (
      <AdBannerItem
        campaign={campaign}
        onPress={() => handleAdPress(campaign)}
      />
    );
  }

  if (displayMode === "card") {
    const campaign = filtered[0];
    return (
      <AdCardItem
        campaign={campaign}
        onPress={() => handleAdPress(campaign)}
      />
    );
  }

  if (displayMode === "carousel") {
    return (
      <FlatList
        data={filtered}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.carouselContainer}
        renderItem={({ item }) => (
          <View style={styles.carouselItem}>
            <AdCardItem
              campaign={item}
              onPress={() => handleAdPress(item)}
            />
          </View>
        )}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  bannerContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  bannerInner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(212, 160, 23, 0.15)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 12,
  },
  bannerTextWrap: {
    flex: 1,
  },
  bannerTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  bannerSponsor: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: "500" as const,
    marginTop: 2,
  },

  cardContainer: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 10,
  },
  cardHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: "700" as const,
  },
  cardSponsor: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "500" as const,
    marginTop: 2,
  },
  cardDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  cardBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(212, 160, 23, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cardBadgeText: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: "600" as const,
    marginLeft: 4,
  },

  carouselContainer: {
    paddingVertical: 8,
  },
  carouselItem: {
    width: SCREEN_WIDTH - 32,
    marginHorizontal: 0,
  },
});
