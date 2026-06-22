import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import WebView from "react-native-webview";

export function GiriMap({ mapUri, style, distanceKm, offlineStatus, streetViewTip, onMessage }: any) {
  return (
    <View style={{ height: 250, borderRadius: 16, overflow: "hidden", marginBottom: 16 }}>
      {mapUri ? (
        <WebView source={{ uri: mapUri }} style={{ flex: 1 }} onMessage={onMessage} scrollEnabled={false} />
      ) : (
        <View style={{ flex: 1, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      )}
      <View style={{ position: "absolute", bottom: 10, right: 10, backgroundColor: "rgba(0,0,0,0.6)", padding: 6, borderRadius: 8 }}>
        <Text style={{ color: "#fff", fontSize: 12 }}>{distanceKm} km</Text>
      </View>
    </View>
  );
}

export function GiriStats({ distanceKm, durationMinutes, bikerScore, scoreColor, styleLabel, isMultiDay, elevationGainM, altitudeMinM, altitudeMaxM, realCurvatureScore, onLoadElevation, elevationLoading }: any) {
  return (
    <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 16, gap: 16 }}>
       <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Distanza</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>{distanceKm} km</Text>
          </View>
          <View>
            <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Tempo</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold" }}>{Math.round(durationMinutes)} min</Text>
          </View>
          <View>
            <Text style={{ fontSize: 12, color: Colors.textSecondary }}>Score</Text>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: scoreColor }}>{Math.round(bikerScore * 100)}%</Text>
          </View>
       </View>
    </View>
  );
}

export function GiriElevation({ elevation, elevationLoading, elevationError, onLoadElevation }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
       <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>Profilo Altimetrico</Text>
       {elevationLoading ? (
         <ActivityIndicator color={Colors.accent} />
       ) : elevationError ? (
         <Text style={{ color: Colors.error }}>{elevationError}</Text>
       ) : elevation ? (
         <View style={{ height: 100, backgroundColor: Colors.surface, borderRadius: 8 }} />
       ) : (
         <TouchableOpacity onPress={onLoadElevation} style={{ padding: 12, backgroundColor: Colors.accent, borderRadius: 8 }}>
            <Text style={{ color: "#fff", textAlign: "center" }}>Carica Elevazione</Text>
         </TouchableOpacity>
       )}
    </View>
  );
}

export function GiriWeather({ weather, weatherIcon }: any) {
  return (
    <View style={{ padding: 16, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 16 }}>
       <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>Meteo lungo il percorso</Text>
       <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name={weatherIcon(weather.weatherCode)} size={24} color={Colors.text} />
          <Text>{weather.weatherDesc}</Text>
       </View>
    </View>
  );
}

export function GiriParticipants({ matchBikers, matchLoading, matchBannerDismissed, onDismissBanner, onFindBikers, onPressBiker }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
       <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>Partecipanti suggeriti</Text>
       {matchLoading ? (
         <ActivityIndicator color={Colors.accent} />
       ) : (
         <TouchableOpacity onPress={onFindBikers} style={{ padding: 12, backgroundColor: Colors.accent, borderRadius: 8 }}>
            <Text style={{ color: "#fff", textAlign: "center" }}>Trova Biker Compatibili</Text>
         </TouchableOpacity>
       )}
    </View>
  );
}
