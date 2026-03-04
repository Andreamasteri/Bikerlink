import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const DEFAULT_PRIVACY_POLICY = `INFORMATIVA SULLA PRIVACY

Ultimo aggiornamento: ${new Date().toLocaleDateString("it-IT")}

1. TITOLARE DEL TRATTAMENTO

Il titolare del trattamento dei dati personali è BikerLink. Per qualsiasi domanda relativa al trattamento dei tuoi dati personali, puoi contattarci all'indirizzo email: privacy@bikerlink.app

2. DATI RACCOLTI

Nell'ambito dell'utilizzo dell'applicazione BikerLink, raccogliamo le seguenti categorie di dati personali:

- Indirizzo email
- Numero di telefono
- Nickname (nome utente)
- Fotografie caricate dall'utente
- Posizione GPS (dati di geolocalizzazione)

3. FINALITÀ DEL TRATTAMENTO

I dati personali raccolti vengono trattati per le seguenti finalità:

- Funzionamento dell'applicazione: garantire il corretto funzionamento delle funzionalità dell'app.
- Matching: permettere la connessione tra utenti con interessi simili.
- Chat: abilitare la comunicazione tra utenti all'interno dell'app.
- Contest: gestire la partecipazione a concorsi e competizioni organizzate tramite l'app.

4. BASE GIURIDICA DEL TRATTAMENTO

La base giuridica per il trattamento dei tuoi dati personali è il consenso espresso dall'utente al momento della registrazione e dell'utilizzo dell'applicazione, ai sensi dell'art. 6, par. 1, lett. a) del Regolamento (UE) 2016/679 (GDPR).

5. CONSERVAZIONE DEI DATI

I dati personali saranno conservati per il tempo strettamente necessario al perseguimento delle finalità per cui sono stati raccolti. In caso di cancellazione dell'account, i dati personali saranno eliminati entro 30 giorni, salvo obblighi di legge che ne impongano una conservazione più lunga.

6. CONDIVISIONE CON TERZI

I tuoi dati personali potranno essere condivisi con:

- Syneco, in qualità di sponsor dell'applicazione, per finalità promozionali e di marketing legate ai servizi offerti tramite BikerLink.

I dati non saranno trasferiti a terzi al di fuori dell'Unione Europea senza adeguate garanzie di protezione.

7. DIRITTI DELL'UTENTE

Ai sensi del GDPR, hai il diritto di:

- Accesso: ottenere la conferma dell'esistenza di un trattamento di dati personali che ti riguardano e accedere a tali dati.
- Rettifica: ottenere la rettifica dei dati personali inesatti che ti riguardano.
- Cancellazione: ottenere la cancellazione dei dati personali che ti riguardano ("diritto all'oblio").
- Portabilità: ricevere i dati personali che ti riguardano in un formato strutturato, di uso comune e leggibile da dispositivo automatico.
- Opposizione: opporti in qualsiasi momento al trattamento dei dati personali che ti riguardano.

8. COME ESERCITARE I TUOI DIRITTI

Per esercitare i diritti sopra elencati, puoi inviare una richiesta all'indirizzo email: privacy@bikerlink.app

Risponderemo alla tua richiesta entro 30 giorni dal ricevimento.

9. COOKIE E SESSIONI

L'applicazione BikerLink utilizza cookie tecnici e di sessione necessari per il corretto funzionamento dell'app. Questi cookie non vengono utilizzati per finalità di profilazione o marketing. I cookie di sessione vengono eliminati automaticamente alla chiusura dell'applicazione.

10. MODIFICHE ALLA POLICY

BikerLink si riserva il diritto di modificare la presente informativa sulla privacy in qualsiasi momento. Le modifiche saranno comunicate agli utenti tramite notifica nell'applicazione o mediante pubblicazione della versione aggiornata. L'uso continuato dell'applicazione dopo la pubblicazione delle modifiche costituisce accettazione delle stesse.

Per qualsiasi domanda o chiarimento, non esitare a contattarci all'indirizzo: privacy@bikerlink.app`;

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data, isLoading } = useQuery<{ text: string }>({
    queryKey: ["/api/settings/privacy-policy"],
  });

  const policyText =
    data?.text && data.text.trim().length > 0
      ? data.text
      : DEFAULT_PRIVACY_POLICY;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentContainer,
            { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.policyText}>{policyText}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
  headerSpacer: {
    width: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  policyText: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.text,
  },
});
