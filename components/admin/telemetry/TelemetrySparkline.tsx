import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Line, Text as SvgText } from "react-native-svg";
import Colors from "@/constants/colors";

export interface BucketItem {
  bucketStart: string;
  at: string;
  total: number;
  events: number;
  errors: number;
}

export interface BucketsData {
  minutes: number;
  buckets: BucketItem[];
}

const CHART_W = 280;
const CHART_H = 56;
const CHART_PAD_LEFT = 28;
const CHART_PAD_BOTTOM = 16;
const CHART_INNER_W = CHART_W - CHART_PAD_LEFT - 4;
const CHART_INNER_H = CHART_H - CHART_PAD_BOTTOM - 4;

function formatHour(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function SparklineChart({
  buckets,
  color,
  valueKey,
  label,
  emptyText,
}: {
  buckets: BucketItem[];
  color: string;
  valueKey: "total" | "errors";
  label: string;
  emptyText: string;
}) {
  if (buckets.length === 0) {
    return (
      <View style={sparkS.emptyWrap}>
        <Text style={sparkS.emptyLabel}>{label}</Text>
        <Text style={sparkS.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  const values = buckets.map((b) => b[valueKey]);
  const maxVal = Math.max(...values, 1);
  const n = buckets.length;
  const barW = Math.max(2, Math.floor((CHART_INNER_W / n) * 0.7));
  const gap = CHART_INNER_W / n;

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const colorBg = color + "22";

  return (
    <View style={sparkS.chartWrap}>
      <Text style={sparkS.chartLabel}>{label}</Text>
      <Svg width={CHART_W} height={CHART_H}>
        {yTicks.map((tick, i) => {
          const y = 4 + CHART_INNER_H - (tick / maxVal) * CHART_INNER_H;
          return (
            <React.Fragment key={i}>
              <Line
                x1={CHART_PAD_LEFT}
                y1={y}
                x2={CHART_W - 4}
                y2={y}
                stroke="#374151"
                strokeWidth={0.5}
                strokeDasharray={i === 0 ? undefined : "2,2"}
              />
              <SvgText
                x={CHART_PAD_LEFT - 2}
                y={y + 3}
                fontSize={7}
                fill="#6b7280"
                textAnchor="end"
              >
                {tick > 999 ? `${Math.round(tick / 100) / 10}k` : String(tick)}
              </SvgText>
            </React.Fragment>
          );
        })}

        {buckets.map((b, i) => {
          const val = b[valueKey];
          const barH = Math.max(1, (val / maxVal) * CHART_INNER_H);
          const x = CHART_PAD_LEFT + i * gap + (gap - barW) / 2;
          const y = 4 + CHART_INNER_H - barH;
          return (
            <React.Fragment key={i}>
              <Rect x={x} y={y} width={barW} height={barH} fill={colorBg} rx={1} />
              <Rect x={x} y={y} width={barW} height={Math.min(2, barH)} fill={color} rx={1} />
            </React.Fragment>
          );
        })}

        {Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1].filter((idx) => idx < n))).map((idx) => {
          const x = CHART_PAD_LEFT + idx * gap + gap / 2;
          return (
            <SvgText
              key={idx}
              x={x}
              y={CHART_H - 2}
              fontSize={7}
              fill="#6b7280"
              textAnchor="middle"
            >
              {formatHour(buckets[idx].bucketStart)}
            </SvgText>
          );
        })}
      </Svg>
      <View style={sparkS.statsRow}>
        <Text style={sparkS.statText}>
          max <Text style={[sparkS.statValue, { color }]}>{maxVal.toLocaleString("it-IT")}</Text>
        </Text>
        <Text style={sparkS.statText}>
          tot{" "}
          <Text style={[sparkS.statValue, { color }]}>
            {values.reduce((a, b) => a + b, 0).toLocaleString("it-IT")}
          </Text>
        </Text>
        <Text style={sparkS.statText}>
          {n} bucket / 24h
        </Text>
      </View>
    </View>
  );
}

const sparkS = StyleSheet.create({
  chartWrap: {
    marginBottom: 8,
  },
  chartLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },
  statText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  statValue: {
    fontFamily: "Inter_600SemiBold",
  },
  emptyWrap: {
    paddingVertical: 8,
  },
  emptyLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
