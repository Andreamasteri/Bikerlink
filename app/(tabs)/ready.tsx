import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReadyToRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/users/profile"],
  });

  const isAvailable = (data as any)?.isAvailable || false;

  const toggleMutation = useMutation({
    mutationFn: async (newVal: boolean) => {
      await apiRequest("PUT", "/api/users/profile/dynamic", {
        isAvailable: newVal,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/profile"] });
    },
  });

  const handleToggle = () => {
    toggleMutation.mutate(!isAvailable);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.content}>
        <Ionicons
          name="bicycle"
          size={80}
          color={isAvailable ? Colors.success : Colors.accentRed}
          style={styles.icon}
        />

        <Text style={styles.statusText}>
          {isAvailable ? "Sei disponibile!" : "Non disponibile"}
        </Text>
        <Text style={styles.statusSubtext}>
          {isAvailable
            ? "Gli altri biker possono vederti sulla mappa"
            : "Tocca il pulsante per renderti disponibile"}
        </Text>

        <Pressable
          style={[
            styles.toggleBtn,
            { backgroundColor: isAvailable ? Colors.success : Colors.accentRed },
          ]}
          onPress={handleToggle}
          disabled={toggleMutation.isPending}
        >
          {toggleMutation.isPending ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <Ionicons
                name={isAvailable ? "checkmark-circle" : "close-circle"}
                size={40}
                color="#fff"
              />
              <Text style={styles.toggleText}>
                {isAvailable ? "Disattiva" : "Attiva"}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  icon: {
    marginBottom: 8,
  },
  statusText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  statusSubtext: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
  },
  toggleBtn: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    gap: 4,
  },
  toggleText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
});
