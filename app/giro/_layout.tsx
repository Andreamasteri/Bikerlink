import React, { useMemo } from "react";
import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function GiroLayout() {
  const colors = useColors();
  const giroScreenOptions = useMemo(
    () => ({ headerShown: false, contentStyle: { backgroundColor: colors.background } }),
    [colors.background]
  );
  return (
    <Stack screenOptions={giroScreenOptions} />
  );
}
