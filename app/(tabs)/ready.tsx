import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ReadyToRideScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
      queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/biker-available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/zavorrine-available-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/online-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/nearby"] });
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
          paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons
          name="bicycle"
          size={64}
          color={isAvailable ? Colors.success : Colors.accentRed}
        />

        <Text style={styles.statusText}>
          {isAvailable ? "Sei disponibile!" : "Non disponibile"}
        </Text>
        <Text style={styles.statusSubtext}>
          {isAvailable
            ? "Fai sapere a tutti che sei online e pronto a farti un giro!"
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
            <Ionicons
              name={isAvailable ? "checkmark-circle" : "close-circle"}
              size={48}
              color="#fff"
            />
          )}
        </Pressable>

        <Pressable
          style={styles.cronoBtn}
          onPress={() => router.push("/tracking" as any)}
        >
          <Ionicons name="navigate" size={20} color={Colors.accent} />
          <Text style={styles.cronoBtnText}>Registra Giro e Performance</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    padding: 24,
    gap: 8,
  },
  statusText: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
    marginTop: 4,
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
    marginTop: 16,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cronoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 32,
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  cronoBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
});
