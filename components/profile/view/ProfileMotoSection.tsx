import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useRouter } from "expo-router";

interface ProfileMotoSectionProps {
  isBikerOrCoppia: boolean;
}

export const ProfileMotoSection: React.FC<ProfileMotoSectionProps> = ({ isBikerOrCoppia }) => {
  const router = useRouter();
  
  return (
    <View style={styles.section}>
      <Pressable style={styles.garageCard} onPress={() => router.push("/garage" as any)}>
        {isBikerOrCoppia ? (
          <MaterialCommunityIcons name="motorbike" size={36} color={Colors.accent} />
        ) : (
          <Ionicons name="heart" size={36} color={Colors.accent} />
        )}
        <Text style={styles.garageCardLabel}>
          {isBikerOrCoppia ? "Il Mio Garage" : "La Mia Wishlist"}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  garageCard: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent + "55",
    paddingVertical: 4,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  garageCardLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
});
