import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

export default function ModeratorLogsRedirect() {
  const t = useT();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === "admin") {
      routerRef.current.replace("/admin/moderator-logs");
    }
  }, [user]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {user?.role === "admin"
          ? "Reindirizzamento in corso…"
          : t("moderator.adminOnly")}
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
