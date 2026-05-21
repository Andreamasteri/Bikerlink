import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface ProfileDonationSectionProps {
  donationData?: { enabled: boolean; text: string; paypalEmail: string };
  t: (key: string) => string;
}

export const ProfileDonationSection: React.FC<ProfileDonationSectionProps> = ({
  donationData,
  t,
}) => {
  if (!donationData?.enabled || !donationData?.paypalEmail) return null;

  return (
    <View style={styles.donationSection}>
      <Image
        source={require("@/assets/images/support-banner.png")}
        style={styles.supportBannerImage}
        resizeMode="cover"
      />
      <Text style={styles.donationTitle}>{t("profile.supportTitle")}</Text>
      <Text selectable style={styles.supportEmail}>{donationData.paypalEmail}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  donationSection: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
  },
  supportBannerImage: {
    width: "100%",
    height: 80,
  },
  donationTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  supportEmail: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
});
