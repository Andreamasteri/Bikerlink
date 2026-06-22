import React from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Pressable, Share, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export function GiriActions({ onNavigate, onOpenGoogleMaps, onOpenWaze, onOpenAppleMaps, onExportGPX, onExportKML, onShare }: any) {
  return (
    <View style={{ gap: 12, marginBottom: 16 }}>
       <TouchableOpacity onPress={onNavigate} style={{ backgroundColor: Colors.accent, padding: 16, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontWeight: "bold" }}>Inizia Navigazione</Text>
       </TouchableOpacity>
       <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={onOpenGoogleMaps} style={{ flex: 1, backgroundColor: Colors.surface, padding: 12, borderRadius: 12, alignItems: "center" }}>
             <Text>Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} style={{ flex: 1, backgroundColor: Colors.surface, padding: 12, borderRadius: 12, alignItems: "center" }}>
             <Text>Condividi</Text>
          </TouchableOpacity>
       </View>
    </View>
  );
}

export function GiriOfflineCard({ status, progress, onDownload, onCancel, onDelete }: any) {
  return (
    <View style={{ padding: 16, backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 16 }}>
       <Text style={{ fontWeight: "bold" }}>Mappe Offline</Text>
       <Text style={{ fontSize: 12, color: Colors.textSecondary, marginBottom: 8 }}>Stato: {status}</Text>
       {status === "none" && <TouchableOpacity onPress={onDownload}><Text style={{ color: Colors.accent }}>Scarica</Text></TouchableOpacity>}
    </View>
  );
}

export function GiriMultiDayInfo({ days, hotels, hotelsLoading, onLoadHotels }: any) {
  return (
    <View style={{ padding: 16, backgroundColor: Colors.surface, borderRadius: 12 }}>
       <Text style={{ fontWeight: "bold" }}>Giro Multigiorno</Text>
       <Text>{days.length} giorni totali</Text>
    </View>
  );
}
