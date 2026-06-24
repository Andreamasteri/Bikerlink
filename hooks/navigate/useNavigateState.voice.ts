/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from "react";

export function useNavVoice(whisper: any, getApiUrl: any, apiRequest: any, triggerRerouteToDestination: any) {
  const [voiceCmdToast, setVoiceCmdToast] = useState<string | null>(null);

  const handleVoiceCommand = useCallback(async () => {
    const text = await whisper.stopAndTranscribe();
    if (!text) {
      setVoiceCmdToast(whisper.error ?? "Trascrizione fallita");
      setTimeout(() => setVoiceCmdToast(null), 3000);
      return;
    }

    setVoiceCmdToast(`🎤 "${text}" — geocodifica...`);

    try {
      const geocodeUrl = new URL("/api/planned-routes/geocode", getApiUrl());
      geocodeUrl.searchParams.set("q", text);
      const geocodeRes = await apiRequest("GET", geocodeUrl.pathname + geocodeUrl.search);
      const results = await geocodeRes.json() as Array<{ lat: number; lon: number; display_name?: string }>;

      if (!Array.isArray(results) || results.length === 0) {
        setVoiceCmdToast("Destinazione non trovata");
        setTimeout(() => setVoiceCmdToast(null), 3000);
        return;
      }

      const { lat, lon } = results[0];
      setVoiceCmdToast(`Ricalcolo verso ${results[0].display_name ?? text}...`);
      await triggerRerouteToDestination(lat, lon);
      setTimeout(() => setVoiceCmdToast(null), 4000);
    } catch {
      setVoiceCmdToast("Errore geocodifica");
      setTimeout(() => setVoiceCmdToast(null), 3000);
    }
  }, [whisper, triggerRerouteToDestination, apiRequest, getApiUrl]);

  return { voiceCmdToast, handleVoiceCommand };
}
