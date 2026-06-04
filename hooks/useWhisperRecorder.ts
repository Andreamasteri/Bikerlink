import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { AudioRecorder } from "expo-audio";

export type WhisperSource = "home" | "cloud";

export type WhisperRecorderState = {
  recording: boolean;
  transcribing: boolean;
  transcript: string | null;
  error: string | null;
  lastSource: WhisperSource | null;
};

export type UseWhisperRecorderReturn = WhisperRecorderState & {
  startRecording: () => Promise<void>;
  stopAndTranscribe: () => Promise<string | null>;
  reset: () => void;
};

export function useWhisperRecorder(): UseWhisperRecorderReturn {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSource, setLastSource] = useState<WhisperSource | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);

  const reset = useCallback(() => {
    setTranscript(null);
    setError(null);
    setRecording(false);
    setTranscribing(false);
    setLastSource(null);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript(null);
    setLastSource(null);

    if (Platform.OS === "web") {
      setError("Registrazione non supportata su web");
      return;
    }

    try {
      const { AudioModule } = await import("expo-audio");
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError("Permesso microfono negato");
        return;
      }

      await AudioModule.setAudioModeAsync({ allowsRecording: true });

      const rec = new AudioModule.AudioRecorder({
        extension: ".m4a",
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
      });

      await rec.prepareToRecordAsync();
      rec.record();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore avvio registrazione";
      setError(msg);
      setRecording(false);
    }
  }, []);

  const stopAndTranscribe = useCallback(async (): Promise<string | null> => {
    if (!recorderRef.current) {
      setError("Nessuna registrazione attiva");
      return null;
    }

    setRecording(false);
    setTranscribing(true);

    try {
      const rec = recorderRef.current;
      recorderRef.current = null;
      await rec.stop();
      const uri = rec.uri;

      if (!uri) {
        setError("Impossibile ottenere il file audio");
        setTranscribing(false);
        return null;
      }

      const transcribeUrl = new URL("/api/whisper/transcribe", getApiUrl()).toString();

      // L'upload via FormData + fetch globale fallisce su native con
      // "unsupported FormDataPart implementation". Usiamo l'upload multipart
      // nativo di expo-file-system (legacy), che serializza correttamente il
      // file e imposta da sé il Content-Type multipart con boundary.
      const { uploadAsync, FileSystemUploadType } = await import("expo-file-system/legacy");
      const response = await uploadAsync(transcribeUrl, uri, {
        httpMethod: "POST",
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: "file",
        mimeType: "audio/m4a",
        headers: authFetchHeaders(),
      });

      if (response.status < 200 || response.status >= 300) {
        let errMsg = "Errore trascrizione";
        try {
          const errData = JSON.parse(response.body) as { message?: string };
          if (errData.message) errMsg = errData.message;
        } catch {
          // body non JSON: manteniamo il messaggio di default
        }
        if (response.status === 503 || response.status === 502) {
          const lower = errMsg.toLowerCase();
          if (lower.includes("non configurato") || lower.includes("non raggiungibile") || lower.includes("fallback cloud non configurato")) {
            errMsg = "Servizio di trascrizione non disponibile";
          }
        }
        setError(errMsg);
        setTranscribing(false);
        return null;
      }

      const data = JSON.parse(response.body) as { text: string; source?: WhisperSource };
      const text = data.text;
      setTranscript(text);
      setLastSource(data.source === "cloud" || data.source === "home" ? data.source : null);
      setTranscribing(false);
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore trascrizione";
      setError(msg);
      setTranscribing(false);
      return null;
    }
  }, []);

  return {
    recording,
    transcribing,
    transcript,
    error,
    lastSource,
    startRecording,
    stopAndTranscribe,
    reset,
  };
}
