import React from "react";
import { View, Text } from "react-native";
import { styles } from "@/components/admin/analytics.styles";
import Colors from "@/constants/colors";

interface FunnelData {
  started: number;
  carouselCompleted: number;
  tagsShown: number;
  tagsSaved: number;
  carouselCompletedFinish: number;
  carouselCompletedSkip: number;
  dropOff?: {
    startedToCarousel: number;
    carouselToTagsShown: number;
    tagsShownToSaved: number;
    startedToSaved: number;
  };
}

export function FunnelContent({ f }: { f: FunnelData | undefined }) {
  const started = f?.started ?? 0;
  const carouselCompleted = f?.carouselCompleted ?? 0;
  const tagsShown = f?.tagsShown ?? 0;
  const tagsSaved = f?.tagsSaved ?? 0;
  const finishN = f?.carouselCompletedFinish ?? 0;
  const skipN = f?.carouselCompletedSkip ?? 0;
  const d = f?.dropOff;

  return (
    <View style={styles.onboardingRows}>
      <View style={styles.onboardingRow}>
        <Text style={styles.onboardingLabel}>1. Onboarding avviato</Text>
        <Text style={styles.onboardingValue}>{started}</Text>
      </View>
      <View style={styles.onboardingRow}>
        <Text style={styles.onboardingLabel}>↓ → 2. Carousel completato</Text>
        <Text style={styles.onboardingValue}>
          {carouselCompleted}{" "}
          <Text style={styles.funnelPct}>({(d?.startedToCarousel ?? 0).toFixed(1)}%)</Text>
        </Text>
      </View>
      <View style={[styles.onboardingRow, styles.onboardingSubRow]}>
        <Text style={styles.onboardingSubLabel}>   • Finiti (Continua)</Text>
        <Text style={styles.onboardingSubValue}>{finishN}</Text>
      </View>
      <View style={[styles.onboardingRow, styles.onboardingSubRow]}>
        <Text style={styles.onboardingSubLabel}>   • Skip</Text>
        <Text style={styles.onboardingSubValue}>{skipN}</Text>
      </View>
      <View style={styles.onboardingRow}>
        <Text style={styles.onboardingLabel}>↓ → 3. Tag mostrati</Text>
        <Text style={styles.onboardingValue}>
          {tagsShown}{" "}
          <Text style={styles.funnelPct}>({(d?.carouselToTagsShown ?? 0).toFixed(1)}%)</Text>
        </Text>
      </View>
      <View style={styles.onboardingRow}>
        <Text style={styles.onboardingLabel}>↓ → 4. Tag salvati</Text>
        <Text style={[styles.onboardingValue, { color: Colors.success }]}>
          {tagsSaved}{" "}
          <Text style={styles.funnelPct}>({(d?.tagsShownToSaved ?? 0).toFixed(1)}%)</Text>
        </Text>
      </View>
      <View style={styles.onboardingRow}>
        <Text style={styles.onboardingLabel}>Conversione totale (start → saved)</Text>
        <Text style={[styles.onboardingValue, { color: Colors.accent }]}>
          {(d?.startedToSaved ?? 0).toFixed(1)}%
        </Text>
      </View>
    </View>
  );
}

interface SkipBySlide {
  index: number;
  count: number;
}

interface TopSkipSlide extends SkipBySlide {
  pct: number;
}

export function SkipCharts({ 
  skipBySlide, 
  topSkipSlides 
}: { 
  skipBySlide: SkipBySlide[], 
  topSkipSlides: TopSkipSlide[] 
}) {
  const totalSkips = skipBySlide.reduce((s, x) => s + x.count, 0);
  if (totalSkips === 0) {
    return <Text style={styles.loadingText}>Nessun abbandono registrato.</Text>;
  }
  const maxCount = Math.max(...skipBySlide.map((s) => s.count), 1);

  return (
    <View style={styles.onboardingRows}>
      <Text style={styles.skipHint}>
        Top 5 slide con più abbandoni ({totalSkips} skip totali)
      </Text>
      {topSkipSlides.map((s) => (
        <View key={`top-${s.index}`} style={styles.skipRow}>
          <Text style={styles.skipLabel}>Slide {s.index + 1}</Text>
          <View style={styles.skipBarTrack}>
            <View
              style={[
                styles.skipBarFill,
                { width: `${(s.count / maxCount) * 100}%` },
              ]}
            />
          </View>
          <Text style={styles.skipValue}>
            {s.count} <Text style={styles.funnelPct}>({s.pct.toFixed(1)}%)</Text>
          </Text>
        </View>
      ))}
      <Text style={[styles.skipHint, { marginTop: 8 }]}>
        Distribuzione completa
      </Text>
      {skipBySlide.map((s) => (
        <View key={`all-${s.index}`} style={styles.skipRow}>
          <Text style={styles.skipLabel}>Slide {s.index + 1}</Text>
          <View style={styles.skipBarTrack}>
            <View
              style={[
                styles.skipBarFill,
                {
                  width: `${(s.count / maxCount) * 100}%`,
                  backgroundColor: Colors.textSecondary,
                },
              ]}
            />
          </View>
          <Text style={styles.skipValue}>{s.count}</Text>
        </View>
      ))}
    </View>
  );
}
