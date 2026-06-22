// Task #2603 — estratto da app/admin/match-control.tsx (mechanical split)
import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import Slider from "@react-native-community/slider";
import Colors from "@/constants/colors";
import { styles } from "@/components/admin/match-control/styles";

export function FreshnessSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onCommit,
  precision = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onCommit: (v: number) => void;
  precision?: number;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const round = (v: number) => {
    const factor = Math.pow(10, precision);
    return Math.round(v * factor) / factor;
  };
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderLabelRow}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>
          {round(local)} {unit}
        </Text>
      </View>
      <Slider
        style={{ width: "100%", height: 36 }}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={local}
        onValueChange={setLocal}
        onSlidingComplete={(v) => onCommit(round(v))}
        minimumTrackTintColor={Colors.accent}
        maximumTrackTintColor={Colors.border}
        thumbTintColor={Colors.accent}
      />
    </View>
  );
}
