import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert } from "react-native";
import { useT } from "@/lib/language-context";

export type OfflineStatus = "none" | "checking" | "downloading" | "available" | "stale" | "error";

interface OfflineState {
  status: OfflineStatus;
  progress: number;
  total: number;
  offlineTileBasePath?: string | null;
  startDownload: () => void;
  cancelDownload: () => void;
  deleteOffline: () => void;
}

interface Props {
  isOffline: boolean;
  offline: OfflineState;
  styles: {
    offlineBanner: object;
    offlineBannerText: object;
    downloadBanner: object;
    downloadBannerText: object;
    downloadProgressWrap: object;
    downloadProgressBg: object;
    downloadProgressFill: object;
    staleBanner: object;
    staleBannerText: object;
    offlineAvailableBanner: object;
    offlineAvailableBannerText: object;
    voiceMicBtn: object;
    voiceMicBtnActive: object;
    voiceToast: object;
    voiceToastText: object;
  };
}

export function NavigationOfflineBanners({
  isOffline,
  offline,
  styles: s,
}: Props) {
  const t = useT();

  return (
    <>
      {isOffline && (
        <View style={s.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={s.offlineBannerText}>Modalità offline — percorso in cache</Text>
        </View>
      )}

      {(offline.status === "none" || offline.status === "error") && (
        <Pressable style={s.downloadBanner} onPress={offline.startDownload}>
          <Ionicons name="download-outline" size={15} color="#fff" />
          <Text style={s.downloadBannerText}>
            {offline.status === "error" ? t("nav.offline.retry") : t("nav.offline.download")}
          </Text>
          {offline.status === "error" && (
            <Ionicons name="alert-circle-outline" size={16} color="rgba(255,200,100,0.9)" />
          )}
        </Pressable>
      )}

      {offline.status === "available" && (
        <Pressable
          style={s.offlineAvailableBanner}
          onPress={() => {
            Alert.alert(
              "Rimuovi mappa offline",
              "Vuoi eliminare le mappe salvate per questo percorso?",
              [
                { text: "Annulla", style: "cancel" },
                {
                  text: "Rimuovi",
                  style: "destructive",
                  onPress: () => offline.deleteOffline(),
                },
              ]
            );
          }}
        >
          <Ionicons name="checkmark-circle-outline" size={15} color="#22c55e" />
          <Text style={s.offlineAvailableBannerText}>Mappa offline ✓</Text>
          <Ionicons name="trash-outline" size={15} color="rgba(255,255,255,0.6)" />
        </Pressable>
      )}

      {offline.status === "downloading" && (
        <View style={s.downloadBanner}>
          <Ionicons name="cloud-download-outline" size={15} color="#fff" />
          <View style={s.downloadProgressWrap}>
            <Text style={s.downloadBannerText}>
              {t("nav.offline.downloading")} {offline.total > 0 ? `${Math.round((offline.progress / offline.total) * 100)}%` : "0%"}
            </Text>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- percentage width string required by StyleSheet */}
            <View style={[s.downloadProgressBg]}><View style={[s.downloadProgressFill, { width: (offline.total > 0 ? `${Math.round((offline.progress / offline.total) * 100)}%` : "0%") as any }]} /></View>
          </View>
          <Pressable onPress={offline.cancelDownload} hitSlop={8}>
            <Ionicons name="close-circle-outline" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        </View>
      )}

      {offline.status === "stale" && (
        <View style={s.staleBanner}>
          <Ionicons name="map-outline" size={14} color="#fff" />
          <Text style={s.staleBannerText}>
            Mappe offline non coprono il percorso ricalcolato
          </Text>
        </View>
      )}

    </>
  );
}
