import React, { useMemo } from "react";
import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function NavigateLayout() {
  const colors = useColors();
  const navigateScreenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.background } }),
    [colors.background]
  );
  return (
    <Stack screenOptions={navigateScreenOptions} />
  );
}
