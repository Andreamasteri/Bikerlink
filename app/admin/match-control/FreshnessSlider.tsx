// Task #2603 — estratto da app/admin/match-control.tsx (mechanical split)
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import Slider from "@react-native-community/slider";
import Colors from "@/constants/colors";
import { styles } from "./styles";

export function FreshnessSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderLabelRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>
          {local} {unit}
        </Text>
      </View>
      <Slider
        style={{ width: "100%", height: 36 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={local}
        onValueChange={setLocal}
        onSlidingComplete={(v) => onCommit(Math.round(v * 10) / 10)}
        minimumTrackTintColor={Colors.accent}
        maximumTrackTintColor={Colors.border}
        thumbTintColor={Colors.accent}
      />
    </View>
  );
}
