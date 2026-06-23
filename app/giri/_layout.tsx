import React, { useMemo } from "react";
import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function GiriLayout() {
  const colors = useColors();
  const giriScreenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.background } }),
    [colors.background]
  );
  return (
    <Stack screenOptions={giriScreenOptions} />
  );
}
