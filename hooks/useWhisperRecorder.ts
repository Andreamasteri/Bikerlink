import { useState, useRef, useCallback } from "react";
import { Platform } from "react-native";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import type { AudioRecorder } from "expo-audio";

export type WhisperRecorderState = {
  recording: boolean;
  transcribing: boolean;
  transcript: string | null;
  error: string | null;
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

  const recorderRef = useRef<AudioRecorder | null>(null);

  const reset = useCallback(() => {
    setTranscript(null);
    setError(null);
    setRecording(false);
    setTranscribing(false);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript(null);

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

      const { AudioRecorder } = await import("expo-audio");
      const rec = new AudioRecorder({
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

      const formData = new FormData();
      const filename = "recording.m4a";
      type RNFileEntry = { uri: string; name: string; type: string };
      (formData as unknown as { append(name: string, value: RNFileEntry): void }).append("file", {
        uri,
        name: filename,
        type: "audio/m4a",
      });

      const transcribeUrl = new URL("/api/whisper/transcribe", getApiUrl()).toString();
      const response = await fetch(transcribeUrl, {
        method: "POST",
        body: formData,
        headers: authFetchHeaders(),
        credentials: "include",
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: "Errore trascrizione" }));
        const errMsg = (errData as { message?: string }).message ?? "Errore trascrizione";
        setError(errMsg);
        setTranscribing(false);
        return null;
      }

      const data = await response.json() as { text: string };
      const text = data.text;
      setTranscript(text);
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
    startRecording,
    stopAndTranscribe,
    reset,
  };
}
