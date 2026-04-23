import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_STORAGE_KEY } from "@/constants/onboarding";
import Colors from "@/constants/colors";

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((val) => {
        setOnboardingDone(val === "true");
        setChecked(true);
      })
      .catch(() => {
        setOnboardingDone(true);
        setChecked(true);
      });
  }, []);

  if (!checked) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  if (onboardingDone) {
    return <Redirect href="/welcome" />;
  }

  return <Redirect href="/onboarding" />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
