import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  sendMessage,
  uploadImage,
  SessionExpiredError,
  registerPushToken,
  registerBowieTerminalToken,
  notificationReply,
  getMainAppForeground,
} from "../lib/bowie-client";
import { createWatchState, evaluateSignal } from "../lib/main-app-watch";
import {
  clearSession,
  getOrCreateDeviceId,
  getRole,
  getSavedTheme,
  getToken,
  saveTheme,
} from "../lib/session";
import {
  addBowieReplyPushListener,
  addMainAppForegroundClosePushListener,
  addReplyListener,
  consumePendingReply,
  setupNotifications,
  showPersistentNotification,
} from "../lib/notifications";
import {
  isPersonaId,
  isThemeName,
  THEMES,
  type PersonaId,
  type ThemeName,
} from "../constants/theme";
import { Composer } from "../components/Composer";
import { MessageBubble } from "../components/MessageBubble";
import { ImageViewerModal } from "../components/ImageViewerModal";
import { WELCOME, type Line } from "../lib/terminal-format";

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const [phase, setPhase] = useState<"boot" | "ready">("boot");
  const [themeName, setThemeName] = useState<ThemeName>("attuale");
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Task #5327 — immagine in composizione (uri locale), inviata al submit.
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  // Task #5335 — immagine selezionata per la vista a tutto schermo.
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  // Task #5298 — schermata di blocco iOS: le app iOS non possono auto-terminarsi,
  // quindi al posto della chiusura mostriamo un overlay a tutto schermo.
  const [locked, setLocked] = useState(false);

  const theme = THEMES[themeName];

  const tokenRef = useRef<string | null>(null);
  const roleRef = useRef<string>("user");
  const idCounter = useRef(0);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const welcomeStartedRef = useRef(false);
  // Task #5272 — ref sempre aggiornato a submitText: usato per l'input digitato
  // a mano nel terminale (invio inline via SSE streaming).
  const submitTextRef = useRef<(raw: string) => void>(() => {});
  // Task #5277 (gap fix) — id stabile del device, e id della riga AI in attesa
  // della push di risposta (una quick-reply per volta: l'app è sempre in
  // foreground quando può inviarne una nuova).
  const deviceIdRef = useRef<string | null>(null);
  const pendingReplyLineIdRef = useRef<string | null>(null);
  const pendingReplyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Task #5298 — stato baseline/ack per rilevare l'apertura dell'app principale.
  const mainAppWatchRef = useRef(createWatchState());

  // ---- line helpers ----
  const pushLine = useCallback((p: Omit<Line, "id">): string => {
    const id = `l${++idCounter.current}`;
    setLines((prev) => [...prev, { id, ...p }]);
    return id;
  }, []);

  const setLineText = useCallback((id: string, text: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text } : l)));
  }, []);

  const appendLineText = useCallback((id: string, chunk: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text: l.text + chunk } : l)));
  }, []);

  const setLinePersona = useCallback((id: string, persona: PersonaId) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, persona } : l)));
  }, []);

  // ---- welcome stream (char by char) ----
  const startWelcome = useCallback(() => {
    if (welcomeStartedRef.current) return;
    welcomeStartedRef.current = true;
    const aiId = pushLine({ kind: "ai", persona: "bowie", text: "" });
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setLineText(aiId, WELCOME.slice(0, i));
      if (i >= WELCOME.length) clearInterval(timer);
    }, 22);
    intervalsRef.current.push(timer);
  }, [pushLine, setLineText]);

  // ---- session expiry ----
  const handleSessionExpired = useCallback(async () => {
    pushLine({ kind: "system", text: "Sessione scaduta — riconnessione..." });
    await clearSession();
    setTimeout(() => router.replace("/login"), 1200);
  }, [pushLine]);

  // ---- auto-chiusura all'apertura dell'app principale (Task #5298) ----
  // Poll periodico + al resume in foreground: se l'app principale BikerLink
  // viene aperta DOPO l'avvio del terminale, su Android chiudiamo l'app, su iOS
  // (che non può auto-terminarsi) mostriamo la schermata di blocco.
  // Task #5304 — azione di auto-chiusura condivisa: sia il poll (fallback)
  // sia la push data-only (percorso rapido) convergono qui. Idempotente: marca
  // lo stato come "triggered" così il poll successivo non ripete l'azione.
  const triggerAutoClose = useCallback(() => {
    mainAppWatchRef.current = { ...mainAppWatchRef.current, triggered: true };
    if (Platform.OS === "android") {
      BackHandler.exitApp();
    } else {
      setLocked(true);
    }
  }, []);

  const checkMainAppForeground = useCallback(async () => {
    if (AppState.currentState !== "active") return;
    const tok = tokenRef.current;
    if (!tok) return;
    try {
      const value = await getMainAppForeground(tok);
      const result = evaluateSignal(mainAppWatchRef.current, value);
      mainAppWatchRef.current = result.state;
      if (result.shouldTrigger) {
        triggerAutoClose();
      }
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await handleSessionExpired();
      }
      // altri errori: best-effort, ritentato al prossimo tick
    }
  }, [handleSessionExpired, triggerAutoClose]);

  // Task #5304 — fallback: il poll ogni 50s resta attivo per i casi in cui la
  // push data-only non arriva (rete assente, token non ancora registrato, ecc).
  useEffect(() => {
    if (phase !== "ready") return;
    // Prima lettura → registra baseline (nessuna azione).
    void checkMainAppForeground();
    const interval = setInterval(() => void checkMainAppForeground(), 50000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void checkMainAppForeground();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [phase, checkMainAppForeground]);

  // ---- notifications (best-effort) ----
  // Task #5309 — iOS registra un push token anche per ricevere il segnale
  // silenzioso di auto-chiusura.
  // Task #5311 — ora iOS mostra anche la notifica persistente con la
  // quick-reply (stessa categoria REPLY di Android): non è più solo per
  // l'auto-chiusura, l'utente può rispondere a Bowie dalla lock notification.
  const initNotifications = useCallback(async (token: string) => {
    if (Platform.OS !== "android" && Platform.OS !== "ios") return;
    try {
      const pushToken = await setupNotifications();
      if (pushToken) {
        await registerPushToken(pushToken, token);
        // Task #5228 — registra il device nel registro per-dispositivo (monitor admin).
        const deviceId = await getOrCreateDeviceId();
        deviceIdRef.current = deviceId;
        await registerBowieTerminalToken(deviceId, pushToken, token);
      }
      await showPersistentNotification();
    } catch {
      /* notifiche best-effort */
    }
  }, []);

  // Task #5277 (gap fix) — la quick-reply dalla notifica (app viva o riaperta
  // da killata) NON usa più lo streaming inline: passa da
  // POST /notification-reply con il deviceId di QUESTO dispositivo, così
  // sendBowieReplyPush() risponde con una push mirata SOLO a lui (mai a un
  // altro telefono con Bowie Terminal, mai a un device revocato dall'admin).
  // La riga AI resta "in attesa" finché addBowieReplyPushListener non riceve
  // la push con il testo — con un timeout di cortesia se non arriva mai.
  const clearPendingReplyTimeout = useCallback(() => {
    if (pendingReplyTimeoutRef.current) {
      clearTimeout(pendingReplyTimeoutRef.current);
      pendingReplyTimeoutRef.current = null;
    }
  }, []);

  const submitNotificationReply = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      pushLine({ kind: "user", text: clean });
      const aiId = pushLine({ kind: "ai", persona: "bowie", text: "···" });
      pendingReplyLineIdRef.current = aiId;
      clearPendingReplyTimeout();
      pendingReplyTimeoutRef.current = setTimeout(() => {
        if (pendingReplyLineIdRef.current === aiId) {
          setLineText(aiId, "Nessuna risposta ricevuta (push non consegnata) — riprova dal terminale");
          pendingReplyLineIdRef.current = null;
        }
      }, 20000);

      try {
        await notificationReply(clean, tokenRef.current ?? "", deviceIdRef.current ?? undefined);
      } catch (e) {
        clearPendingReplyTimeout();
        pendingReplyLineIdRef.current = null;
        if (e instanceof SessionExpiredError) {
          await handleSessionExpired();
          return;
        }
        setLineText(aiId, `! ${(e as Error).message}`);
      }
    },
    [clearPendingReplyTimeout, handleSessionExpired, pushLine, setLineText],
  );

  // ---- bootstrap ----
  useEffect(() => {
    let replyListener: { remove: () => void } | null = null;
    let pushListener: { remove: () => void } | null = null;
    let closeSignalListener: { remove: () => void } | null = null;
    (async () => {
      const tok = await getToken();
      if (!tok) {
        router.replace("/login");
        return;
      }
      tokenRef.current = tok;
      roleRef.current = (await getRole()) ?? "user";
      const saved = await getSavedTheme();
      if (saved && isThemeName(saved)) setThemeName(saved);
      setPhase("ready");
      startWelcome();
      // Task #5272/#5277 — quick-reply notifica: app viva → listener; app killata
      // → riaperta dall'OS (opensAppToForeground) → recupero cold-start. In
      // entrambi i casi il testo passa da notification-reply (push mirata al
      // device), NON dallo streaming inline usato per l'input digitato a mano.
      replyListener = addReplyListener((text) => void submitNotificationReply(text));
      pushListener = addBowieReplyPushListener((reply) => {
        const pendingId = pendingReplyLineIdRef.current;
        clearPendingReplyTimeout();
        const persona: PersonaId = isPersonaId(reply.persona) ? reply.persona : "bowie";
        if (pendingId) {
          setLinePersona(pendingId, persona);
          setLineText(pendingId, reply.text);
          pendingReplyLineIdRef.current = null;
        } else {
          pushLine({ kind: "ai", persona, text: reply.text });
        }
        historyRef.current.push({ role: "assistant", content: reply.text });
      });
      // Task #5304 — percorso rapido di auto-chiusura: push data-only in
      // arrivo dal server appena l'app principale va in foreground. Il poll
      // (sopra) resta come fallback se la push non arriva.
      closeSignalListener = addMainAppForegroundClosePushListener(() => triggerAutoClose());
      void initNotifications(tok);
      const pending = await consumePendingReply();
      if (pending) void submitNotificationReply(pending);
    })();

    return () => {
      intervalsRef.current.forEach(clearInterval);
      abortRef.current?.abort();
      replyListener?.remove();
      pushListener?.remove();
      closeSignalListener?.remove();
      clearPendingReplyTimeout();
    };
  }, [
    clearPendingReplyTimeout,
    initNotifications,
    pushLine,
    setLinePersona,
    setLineText,
    startWelcome,
    submitNotificationReply,
    triggerAutoClose,
  ]);

  // ---- local commands ----
  const handleCommand = useCallback(
    (raw: string): boolean => {
      const cmd = raw.trim().toLowerCase();
      if (cmd === "logout") {
        void (async () => {
          await clearSession();
          router.replace("/login");
        })();
        return true;
      }
      if (cmd === "clear") {
        setLines([]);
        return true;
      }
      if (cmd === "help") {
        pushLine({
          kind: "system",
          text: "comandi: logout · clear · help · theme <attuale|asfalto|velocita|rotta>",
        });
        return true;
      }
      if (cmd.startsWith("theme")) {
        const name = cmd.split(/\s+/)[1] ?? "";
        if (isThemeName(name)) {
          setThemeName(name);
          void saveTheme(name);
          pushLine({ kind: "system", text: `tema → ${name}` });
        } else {
          pushLine({ kind: "system", text: "temi: attuale · asfalto · velocita · rotta" });
        }
        return true;
      }
      return false;
    },
    [pushLine],
  );

  // ---- image picker ----
  const pickImage = useCallback(async () => {
    if (streaming) return;
    const fromLibrary = async () => {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const r = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
        });
        if (!r.canceled && r.assets[0]) setAttachedImage(r.assets[0].uri);
      } catch {
        /* best-effort */
      }
    };
    const fromCamera = async () => {
      try {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
        if (!r.canceled && r.assets[0]) setAttachedImage(r.assets[0].uri);
      } catch {
        /* best-effort */
      }
    };
    if (Platform.OS === "web") {
      void fromLibrary();
      return;
    }
    Alert.alert("Aggiungi immagine", undefined, [
      { text: "Fotocamera", onPress: () => void fromCamera() },
      { text: "Libreria", onPress: () => void fromLibrary() },
      { text: "Annulla", style: "cancel" },
    ]);
  }, [streaming]);

  // ---- send ----
  const submitText = useCallback(async (raw: string) => {
    const text = raw.trim();
    const image = attachedImage;
    if ((!text && !image) || streaming) return;
    setInput("");
    // I comandi valgono solo per messaggi di solo testo (senza immagine).
    if (text && !image && handleCommand(text)) return;

    pushLine({ kind: "user", text, imageUri: image ?? undefined });
    setAttachedImage(null);
    const aiId = pushLine({ kind: "ai", persona: "bowie", text: "" });
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const history = historyRef.current.slice(-8);
    // Il server richiede un messaggio non vuoto: se c'è solo l'immagine, invia
    // un prompt neutro (l'utente vede comunque solo la sua immagine nella bolla).
    const outMessage = text || "Guarda questa immagine.";

    try {
      let imageUrls: string[] | undefined;
      if (image) {
        try {
          const url = await uploadImage(image, tokenRef.current ?? "");
          imageUrls = [url];
        } catch (e) {
          if (e instanceof SessionExpiredError) {
            await handleSessionExpired();
            return;
          }
          appendLineText(aiId, `\n! upload immagine fallito: ${(e as Error).message}`);
        }
      }

      await sendMessage(
        outMessage,
        tokenRef.current ?? "",
        {
          onPersona: (p) => setLinePersona(aiId, p),
          onDelta: (d) => appendLineText(aiId, d),
          onDone: (done) => {
            if (done.persona) setLinePersona(aiId, done.persona);
            // Task #849 — guard aggiuntivo lato client: se per qualsiasi
            // ragione futura il backend invia done.text vuoto o solo spazio,
            // il bubble NON resta muto — mostra un messaggio di errore chiaro.
            const doneText = done.text?.trim()
              ? done.text
              : "⚠️ Nessuna risposta ricevuta — riprova.";
            setLineText(aiId, doneText);
            historyRef.current.push(
              { role: "user", content: outMessage },
              { role: "assistant", content: doneText },
            );
          },
          onError: (e) => appendLineText(aiId, `\n! ${e.message}`),
        },
        { history, signal: controller.signal, imageUrls },
      );
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await handleSessionExpired();
        return;
      }
      appendLineText(aiId, `\n! ${(e as Error).message}`);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [
    appendLineText,
    attachedImage,
    handleCommand,
    handleSessionExpired,
    pushLine,
    setLinePersona,
    setLineText,
    streaming,
  ]);

  const onSubmit = useCallback(() => {
    void submitText(input);
  }, [submitText, input]);

  // Mantiene il ref allineato all'ultima submitText per la quick-reply notifica.
  useEffect(() => {
    submitTextRef.current = (raw: string) => void submitText(raw);
  }, [submitText]);

  // ---- render ----
  const reversed = useMemo(() => [...lines].reverse(), [lines]);

  const renderItem = useCallback(
    ({ item }: { item: Line }) => (
      <MessageBubble item={item} theme={theme} streaming={streaming} onImagePress={setViewerImage} />
    ),
    [theme, streaming],
  );

  if (phase === "boot") {
    return <View style={[styles.root, { backgroundColor: theme.background }]} />;
  }

  // Task #5298 — schermata di blocco iOS: l'app principale è stata aperta.
  // Non potendo auto-terminarsi, il terminale sostituisce la UI con questo
  // messaggio a tutto schermo e invita l'utente a chiudere manualmente.
  if (locked) {
    return (
      <View
        style={[
          styles.lockRoot,
          { backgroundColor: theme.background, paddingTop: topInset + 24, paddingBottom: bottomInset + 24 },
        ]}
      >
        <Text style={[styles.lockTitle, { color: theme.bowie }]}>BikerLink è aperto</Text>
        <Text style={[styles.lockBody, { color: theme.text }]}>
          Bowie è già disponibile dentro l'app principale BikerLink.
        </Text>
        <Text style={[styles.lockBody, { color: theme.textSecondary }]}>
          Chiudi questa app per continuare da BikerLink.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.header,
          { paddingTop: topInset + 8, borderBottomColor: theme.border },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: theme.bowie }]}>
          <Ionicons name="sparkles" size={18} color={theme.accentText} />
        </View>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Bowie</Text>
      </View>

      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={reversed}
        keyExtractor={(l) => l.id}
        renderItem={renderItem}
        inverted
        scrollEnabled={reversed.length > 0}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />

      <Composer
        input={input}
        onChangeText={setInput}
        onSubmit={onSubmit}
        streaming={streaming}
        attachedImage={attachedImage}
        onRemoveImage={() => setAttachedImage(null)}
        onPickImage={pickImage}
        theme={theme}
        bottomInset={bottomInset}
      />

      <ImageViewerModal uri={viewerImage} onClose={() => setViewerImage(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  lockRoot: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  lockTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16, textAlign: "center" },
  lockBody: { fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 10 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  list: { flex: 1 },
  listContent: { padding: 12 },
});
