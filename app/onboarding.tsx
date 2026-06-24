import React, { useCallback, useRef, useState } from "react";
import { StatusBar, View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import OnboardingCarousel from "@/components/OnboardingCarousel";
import OnboardingTagsStep from "@/components/onboarding/OnboardingTagsStep";
import Colors from "@/constants/colors";

import { ONBOARDING_STORAGE_KEY } from "@/constants/onboarding";

type Stage = "carousel" | "tags";

async function markOnboardingComplete() {
  try {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  } catch {
    // no-op: onboarding completion persists on next attempt
  }
}

export default function OnboardingScreen() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [stage, setStage] = useState<Stage>("carousel");

  const finishOnboarding = useCallback(async () => {
    await markOnboardingComplete();
    routerRef.current.replace("/welcome");
  }, []);

  const handleCarouselComplete = useCallback(() => {
    setStage("tags");
  }, []);

  const handleCarouselSkip = useCallback(() => {
    setStage("tags");
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      {stage === "carousel" ? (
        <OnboardingCarousel
          onComplete={handleCarouselComplete}
          onSkip={handleCarouselSkip}
        />
      ) : (
        <OnboardingTagsStep onDone={finishOnboarding} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
