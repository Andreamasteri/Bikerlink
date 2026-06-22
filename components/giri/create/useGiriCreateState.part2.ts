import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { getApiUrl } from "@/lib/query-client";
import { Waypoint } from "./types";
import { fetchWeatherPreview } from "./api";

export async function handleImportGpxHelper(qc: any, router: any, setIsImportingGpx: (v: boolean) => void) {
  try {
    setIsImportingGpx(true);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/gpx+xml", "application/octet-stream", "*/*"],
      copyToCacheDirectory: true
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const gpxContent = await FileSystem.readAsStringAsync(asset.uri);
    const rawName = asset.name ?? "";
    const guessedTitle = rawName.replace(/\.gpx$/i, "").replace(/[_-]+/g, " ").trim();
    const url = new URL("/api/planned-routes/import-gpx", getApiUrl());
    const resp = await fetch(url.toString(), {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gpxContent, title: guessedTitle || undefined })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err as Error).message ?? "Importazione fallita");
    }
    const route = await resp.json() as { id: string };
    qc.invalidateQueries({ queryKey: ["/api/planned-routes"] });
    router.replace(`/giri/${route.id}` as any);
  } catch (err: unknown) {
    Alert.alert("Errore GPX", err instanceof Error ? (err as Error).message : "Impossibile leggere il file GPX.");
  } finally {
    setIsImportingGpx(false);
  }
}

export async function autoLoadWeatherHelper(wps: Waypoint[], setWeatherLoading: (v: boolean) => void, setWeatherPreview: (v: any) => void) {
  setWeatherLoading(true);
  try {
    const data = await fetchWeatherPreview(wps);
    setWeatherPreview(data.length > 0 ? data : null);
  } catch {
    setWeatherPreview(null);
  } finally {
    setWeatherLoading(false);
  }
}
