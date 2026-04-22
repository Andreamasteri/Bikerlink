import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

export default function ModeratorLogsRedirect() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === "admin") {
      router.replace("/admin/moderator-logs");
    }
  }, [user, router]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {user?.role === "admin"
          ? "Reindirizzamento in corso…"
          : "I log moderatori sono disponibili solo per gli amministratori."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    padding: 32,
  },
  text: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    lineHeight: 22,
  },
});
