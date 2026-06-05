import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const INFO_SECTIONS = [
  {
    icon: "crosshairs-gps" as const,
    color: "#f59e0b",
    title: "Cos'è la telemetria",
    body: "GPS + accelerometro raccolti a 1 campione/secondo durante ogni giro. I dati vengono bufferizzati in locale e inviati al server ogni 90 secondi (o ogni 200 campioni). Comprendono: coordinate, velocità, angolo di piega, G-force, altitudine.",
  },
  {
    icon: "play-circle-outline" as const,
    color: "#22c55e",
    title: "Quando si raccolgono i dati",
    body: "La raccolta parte automaticamente quando il tracciamento GPS è attivo (bottone REC nella schermata mappa). Si ferma al termine del giro e i dati residui vengono inviati. Se l'app va in background, la raccolta continua con un task di sistema (richiede permesso posizione sempre).",
  },
  {
    icon: "account-group" as const,
    color: "#3b82f6",
    title: "Riepilogo globale",
    body: 'Aggrega tutti i giri di tutti gli utenti. "Utenti con dati" = almeno un giro registrato. "Campioni totali" = singole letture GPS. "Km totali" = somma delle distanze percorse, calcolata geometricamente dai campioni. I giri ideal_lap (pista) sono esclusi.',
  },
  {
    icon: "chart-line" as const,
    color: Colors.accent,
    title: "Progresso collettivo",
    body: "Obiettivo di km aggregati per abilitare i percorsi personalizzati basati su dati reali. Quando raggiunto, l'algoritmo curvy route può usare telemetria vera invece dei dati OSM base. L'obiettivo è configurabile da questa schermata.",
  },
  {
    icon: "map-marker-check" as const,
    color: "#f59e0b",
    title: "Map Matching OSM (Fase 2)",
    body: "Job notturno alle 02:00 che aggancia ogni campione GPS al segmento stradale OSM più vicino, tramite GraphHopper. Popola osm_way_id nella tabella telemetria. Richiede GraphHopper configurato (GRAPHHOPPER_URL o server ThinkCentre). Può essere eseguito manualmente.",
  },
  {
    icon: "sine-wave" as const,
    color: "#8b5cf6",
    title: "Curvy Score (Fase 3)",
    body: "Job settimanale (domenica 03:00) che calcola il curvy_score di ogni segmento OSM basandosi sull'angolo di piega e G-force reali dei biker. Dipende dal Map Matching: deve essere eseguito dopo. Più biker percorrono la stessa strada, più lo score è preciso.",
  },
  {
    icon: "alert-circle-outline" as const,
    color: "#ef4444",
    title: "Se i valori sono 0",
    body: "Nessun giro è ancora stato completato con la telemetria attiva. Per raccogliere dati: apri l'app su un dispositivo reale, vai sulla mappa, premi REC, fai un giro, premi di nuovo REC. I dati appariranno qui entro pochi minuti. Il simulatore non invia telemetria reale.",
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function InfoModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[styles.modalSheet, { paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalTitleRow}>
            <Ionicons name="information-circle" size={20} color={Colors.accent} />
            <Text style={styles.modalTitle}>Come funziona il monitor telemetria</Text>
          </View>

          <ScrollView
            style={styles.modalScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 16 }}
          >
            {INFO_SECTIONS.map((s) => (
              <View key={s.title} style={styles.infoBlock}>
                <View style={styles.infoBlockHeader}>
                  <View style={[styles.infoIconBg, { backgroundColor: s.color + "22" }]}>
                    <MaterialCommunityIcons name={s.icon} size={16} color={s.color} />
                  </View>
                  <Text style={styles.infoBlockTitle}>{s.title}</Text>
                </View>
                <Text style={styles.infoBlockBody}>{s.body}</Text>
              </View>
            ))}

            <View style={styles.pipelineBanner}>
              <Text style={styles.pipelineBannerTitle}>Pipeline completa</Text>
              <Text style={styles.pipelineBannerBody}>
                {"Giro completato  →  batch GPS inviato  →  Map Matching (02:00)  →  Curvy Score (dom. 03:00)  →  percorsi personalizzati"}
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.modalCloseBtnText}>Chiudi</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    maxHeight: "88%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
    flex: 1,
  },
  modalScroll: {
    flexGrow: 0,
  },
  infoBlock: {
    gap: 6,
  },
  infoBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoIconBg: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBlockTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  infoBlockBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    paddingLeft: 36,
  },
  pipelineBanner: {
    backgroundColor: Colors.accent + "15",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
  },
  pipelineBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.accent,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pipelineBannerBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 18,
  },
  modalCloseBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  modalCloseBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#000",
  },
});
