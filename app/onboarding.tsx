import React, { useCallback } from "react";
import { StatusBar } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import OnboardingCarousel from "@/components/OnboardingCarousel";

import { ONBOARDING_STORAGE_KEY } from "@/constants/onboarding";

async function markOnboardingComplete() {
  try {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
  } catch {}
}

export default function OnboardingScreen() {
  const router = useRouter();

  const handleComplete = useCallback(async () => {
    await markOnboardingComplete();
    router.replace("/welcome");
  }, [router]);

  const handleSkip = useCallback(async () => {
    await markOnboardingComplete();
    router.replace("/welcome");
  }, [router]);

  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <OnboardingCarousel onComplete={handleComplete} onSkip={handleSkip} />
    </>
  );
}
