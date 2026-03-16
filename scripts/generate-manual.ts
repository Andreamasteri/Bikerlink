import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUTPUT_PATH = path.resolve(__dirname, "../server/public/bikerlink-manual.pdf");

const ORANGE = "#FF6B35";
const DARK_BG = "#1a1a2e";
const LIGHT_TEXT = "#CCCCCC";
const WHITE = "#FFFFFF";
const SECTION_COLORS = ["#FF6B35", "#3498db", "#2ecc71", "#e74c3c", "#9b59b6"];

interface ManualSection {
  title: string;
  chapters: { heading: string; body: string }[];
}

const MANUAL: Record<string, ManualSection> = {
  it: {
    title: "MANUALE UTENTE — ITALIANO",
    chapters: [
      {
        heading: "1. Registrazione e Accesso",
        body: `Per utilizzare BikerLink, scarica l'app e crea un account. Nella schermata di registrazione, scegli il tuo tipo di utente:

• Biker — Sei un motociclista con la tua moto
• Zavorrina/o — Sei un passeggero in cerca di un passaggio
• Coppia — Siete una coppia che viaggia insieme

Inserisci il tuo nickname (unico), email, password, anno di nascita e seleziona il tuo paese e la tua regione. Dopo la registrazione, potresti ricevere un codice di verifica via email. Inseriscilo nell'app per attivare il tuo account.

Per accedere in futuro, usa la tua email (o nickname) e password. Se dimentichi la password, usa la funzione "Password dimenticata" nella schermata di login.`,
      },
      {
        heading: "2. Navigazione dell'App",
        body: `L'app è organizzata in tab nella barra inferiore:

• Mappa — Visualizza i biker e le zavorrine disponibili nella tua zona
• Proposte — Crea e partecipa a proposte di giro, raduno o passaggio
• Chat — Messaggi privati e chat di gruppo MotoClub
• Contest — Partecipa ai contest fotografici settimanali
• Profilo — Gestisci il tuo profilo, le foto, le moto e le impostazioni`,
      },
      {
        heading: "3. Mappa e Disponibilità",
        body: `La mappa mostra tutti gli utenti disponibili nella tua zona con icone colorate:

• Blu — Biker maschio
• Rosa — Zavorrina/Biker femmina
• Viola — Coppia

Puoi attivare/disattivare la tua disponibilità con il toggle "Sono disponibile" in alto. Usa i filtri per mostrare solo biker, solo zavorrine o entrambi. Tocca un'icona sulla mappa per vedere il profilo dell'utente e inviargli un messaggio.`,
      },
      {
        heading: "4. SOS Biker",
        body: `In caso di emergenza stradale, usa la funzione SOS dalla tab Ride:

1. Tocca il pulsante "Lancia SOS"
2. Imposta il raggio di ricerca (10-100 km)
3. Conferma l'invio — tutti i biker nel raggio riceveranno una notifica
4. Chi è disponibile potrà rispondere e venire in tuo soccorso

L'SOS mostra la tua posizione esatta sulla mappa e permette ai soccorritori di raggiungerti facilmente.`,
      },
      {
        heading: "5. Proposte",
        body: `Le proposte ti permettono di organizzare uscite e trovare compagni di viaggio:

Tipi di proposta:
• FindAFriend — Cerchi altri biker per un giro insieme
• Trova Zavorrina — Hai la sella libera e cerchi un passeggero
• Hitcher — Offri un passaggio a qualcuno
• HitchHiker — Cerchi un passaggio

Per creare una proposta: tocca il pulsante "+" nella tab Proposte, scegli il tipo, inserisci titolo, descrizione, luogo di partenza e orario. Gli altri utenti potranno partecipare o contattarti.`,
      },
      {
        heading: "6. Match Garage",
        body: `Il Match Garage è un sistema automatico che abbina biker e zavorrine in base alla compatibilità delle moto:

1. Aggiungi le tue moto nel Garage (tab Profilo → Garage)
2. Se sei una zavorrina, indica le tue preferenze di moto nella Wishlist
3. Il sistema cerca automaticamente abbinamenti compatibili
4. Quando c'è un match, ricevi una notifica
5. Puoi accettare o rifiutare il match
6. Se entrambi accettate, si apre una chat privata

Il match tiene conto di: marca, modello, tipo di moto e stile di guida.`,
      },
      {
        heading: "7. Chat Privata",
        body: `La chat privata ti permette di comunicare con gli altri utenti:

• Puoi inviare messaggi di testo
• Le conversazioni sono visibili solo ai partecipanti
• Puoi accedere alla chat da: profilo di un utente, match accettato, o dalla tab Chat

I messaggi vengono consegnati in tempo reale. Puoi anche inviare la tua posizione per facilitare gli incontri.`,
      },
      {
        heading: "8. MotoClub",
        body: `I MotoClub sono gruppi per motociclisti dello stesso brand o della stessa zona:

• Cerca il tuo MotoClub nella tab dedicata
• Richiedi l'iscrizione — l'approvazione è automatica o manuale
• Una volta iscritto, accedi alla chat di gruppo del club
• Usa gli hashtag (#) per filtrare i messaggi per argomento
• Ogni club mostra il numero di membri e le informazioni del brand

Puoi far parte di più MotoClub contemporaneamente.`,
      },
      {
        heading: "9. Contest Foto",
        body: `Ogni settimana c'è un contest fotografico a tema:

1. Carica la tua foto migliore dal pulsante nella tab Contest
2. Vota le foto degli altri utenti (hai un numero limitato di voti al giorno)
3. Alla fine della settimana, la foto con più voti vince
4. I vincitori vengono mostrati nell'Albo dei Vincitori

Le foto devono essere appropriate e rispettare le linee guida della community.`,
      },
      {
        heading: "10. Tracking GPS",
        body: `La funzione Tracking registra i tuoi percorsi in moto:

1. Dalla tab Ride, premi "Avvia tracking"
2. L'app registra: distanza, velocità, altitudine e durata
3. Puoi regolare la frequenza GPS per risparmiare batteria
4. Premi "Ferma tracking" per terminare la registrazione
5. I percorsi vengono salvati nella tua cronologia

I dati di tracking contribuiscono alle tue statistiche nel profilo (km totali, giri fatti).`,
      },
      {
        heading: "11. Easter Eggs",
        body: `Sparsi per l'Europa ci sono degli Easter Eggs virtuali da raccogliere:

• Quando sei vicino a un Easter Egg, ricevi una notifica
• Tocca "Raccogli!" per aggiungerlo alla tua collezione
• Ogni Easter Egg vale dei punti
• Controlla il contatore nel tuo profilo per vedere quanti ne hai trovati

È un modo divertente per esplorare nuove zone durante i tuoi giri!`,
      },
      {
        heading: "12. Impostazioni e Lingua",
        body: `Nel tuo profilo puoi personalizzare l'app:

• Lingua — Scegli tra Italiano, English, Deutsch, Español e Français
• Modifica profilo — Aggiorna bio, foto, telefono
• Garage — Gestisci le tue moto
• Preferenze di ricerca — Scegli se vedere solo biker, solo zavorrine o entrambi
• Donazione — Supporta lo sviluppo dell'app

La lingua si cambia dal selettore nel profilo. Tutte le schermate si aggiornano immediatamente.`,
      },
      {
        heading: "13. Sicurezza e Privacy",
        body: `BikerLink prende seriamente la tua sicurezza:

• La tua posizione è visibile solo quando sei "disponibile"
• Puoi segnalare utenti inappropriati (Profilo utente → Segnala)
• Le foto vengono moderate prima della pubblicazione
• Puoi eliminare il tuo account in qualsiasi momento (Profilo → Elimina Account)
• L'eliminazione è definitiva dopo 30 giorni — puoi annullarla facendo il login
• I tuoi dati sono protetti secondo la normativa europea GDPR

Per qualsiasi problema, usa la sezione Feedback nel profilo.`,
      },
    ],
  },
  en: {
    title: "USER MANUAL — ENGLISH",
    chapters: [
      {
        heading: "1. Registration and Login",
        body: `To use BikerLink, download the app and create an account. On the registration screen, choose your user type:

• Biker — You're a motorcyclist with your own bike
• Pillion — You're a passenger looking for a ride
• Couple — You're a couple riding together

Enter your nickname (unique), email, password, birth year and select your country and region. After registration, you may receive a verification code via email. Enter it in the app to activate your account.

To log in later, use your email (or nickname) and password. If you forget your password, use the "Forgot password" feature on the login screen.`,
      },
      {
        heading: "2. App Navigation",
        body: `The app is organized in tabs at the bottom bar:

• Map — View available bikers and pillions in your area
• Proposals — Create and join ride proposals, rallies or ride-sharing
• Chat — Private messages and MotoClub group chats
• Contest — Participate in weekly photo contests
• Profile — Manage your profile, photos, motorcycles and settings`,
      },
      {
        heading: "3. Map and Availability",
        body: `The map shows all available users in your area with colored icons:

• Blue — Male biker
• Pink — Female biker/Pillion
• Purple — Couple

Toggle your availability with the "I'm available" switch at the top. Use filters to show only bikers, only pillions, or both. Tap an icon on the map to view a user's profile and send them a message.`,
      },
      {
        heading: "4. Biker SOS",
        body: `In case of a roadside emergency, use the SOS feature from the Ride tab:

1. Tap the "Launch SOS" button
2. Set your search radius (10-100 km)
3. Confirm the send — all bikers within range will receive a notification
4. Those available can respond and come to your aid

The SOS shows your exact location on the map, making it easy for rescuers to reach you.`,
      },
      {
        heading: "5. Proposals",
        body: `Proposals let you organize outings and find travel companions:

Proposal types:
• FindAFriend — Looking for other bikers for a group ride
• Find Pillion — You have a free seat and are looking for a passenger
• Hitcher — You're offering a ride to someone
• HitchHiker — You're looking for a ride

To create a proposal: tap the "+" button in the Proposals tab, choose the type, enter title, description, departure location and time. Other users can join or contact you.`,
      },
      {
        heading: "6. Garage Match",
        body: `Garage Match is an automatic system that pairs bikers and pillions based on motorcycle compatibility:

1. Add your motorcycles in the Garage (Profile tab → Garage)
2. If you're a pillion, set your motorcycle preferences in the Wishlist
3. The system automatically searches for compatible matches
4. When there's a match, you receive a notification
5. You can accept or reject the match
6. If both accept, a private chat opens

The match considers: brand, model, motorcycle type and riding style.`,
      },
      {
        heading: "7. Private Chat",
        body: `Private chat allows you to communicate with other users:

• You can send text messages
• Conversations are visible only to participants
• Access chat from: a user's profile, an accepted match, or the Chat tab

Messages are delivered in real-time. You can also share your location to facilitate meetups.`,
      },
      {
        heading: "8. MotoClub",
        body: `MotoClubs are groups for motorcyclists of the same brand or area:

• Search for your MotoClub in the dedicated tab
• Request membership — approval may be automatic or manual
• Once enrolled, access the club's group chat
• Use hashtags (#) to filter messages by topic
• Each club shows member count and brand information

You can be part of multiple MotoClubs simultaneously.`,
      },
      {
        heading: "9. Photo Contest",
        body: `Every week there's a themed photo contest:

1. Upload your best photo from the button in the Contest tab
2. Vote for other users' photos (limited votes per day)
3. At the end of the week, the photo with the most votes wins
4. Winners are displayed in the Winners Hall

Photos must be appropriate and follow community guidelines.`,
      },
      {
        heading: "10. GPS Tracking",
        body: `The Tracking feature records your motorcycle routes:

1. From the Ride tab, press "Start tracking"
2. The app records: distance, speed, altitude and duration
3. You can adjust GPS frequency to save battery
4. Press "Stop tracking" to end the recording
5. Routes are saved in your history

Tracking data contributes to your profile statistics (total km, rides completed).`,
      },
      {
        heading: "11. Easter Eggs",
        body: `Scattered across Europe are virtual Easter Eggs to collect:

• When you're near an Easter Egg, you receive a notification
• Tap "Collect!" to add it to your collection
• Each Easter Egg is worth points
• Check the counter in your profile to see how many you've found

It's a fun way to explore new areas during your rides!`,
      },
      {
        heading: "12. Settings and Language",
        body: `In your profile you can customize the app:

• Language — Choose between Italiano, English, Deutsch, Español and Français
• Edit profile — Update bio, photos, phone number
• Garage — Manage your motorcycles
• Search preferences — Choose to see only bikers, only pillions, or both
• Donation — Support app development

Change language from the selector in your profile. All screens update immediately.`,
      },
      {
        heading: "13. Security and Privacy",
        body: `BikerLink takes your security seriously:

• Your location is visible only when you're "available"
• You can report inappropriate users (User profile → Report)
• Photos are moderated before publication
• You can delete your account at any time (Profile → Delete Account)
• Deletion is permanent after 30 days — you can cancel by logging in
• Your data is protected under European GDPR regulations

For any issues, use the Feedback section in your profile.`,
      },
    ],
  },
  de: {
    title: "BENUTZERHANDBUCH — DEUTSCH",
    chapters: [
      {
        heading: "1. Registrierung und Anmeldung",
        body: `Um BikerLink zu nutzen, lade die App herunter und erstelle ein Konto. Wähle auf dem Registrierungsbildschirm deinen Benutzertyp:

• Biker — Du bist ein Motorradfahrer mit eigenem Motorrad
• Sozia — Du bist Beifahrer/in und suchst eine Mitfahrgelegenheit
• Paar — Ihr seid ein Paar, das zusammen fährt

Gib deinen Nickname (einzigartig), E-Mail, Passwort, Geburtsjahr ein und wähle dein Land und deine Region. Nach der Registrierung erhältst du möglicherweise einen Bestätigungscode per E-Mail. Gib ihn in der App ein, um dein Konto zu aktivieren.

Zum späteren Einloggen verwende deine E-Mail (oder Nickname) und dein Passwort. Wenn du dein Passwort vergisst, nutze die Funktion "Passwort vergessen" auf dem Login-Bildschirm.`,
      },
      {
        heading: "2. App-Navigation",
        body: `Die App ist in Tabs in der unteren Leiste organisiert:

• Karte — Zeigt verfügbare Biker und Sozias in deiner Nähe
• Vorschläge — Erstelle und nimm an Tourenvorschlägen, Treffen oder Mitfahrgelegenheiten teil
• Chat — Private Nachrichten und MotoClub-Gruppenchats
• Contest — Nimm an wöchentlichen Fotowettbewerben teil
• Profil — Verwalte dein Profil, Fotos, Motorräder und Einstellungen`,
      },
      {
        heading: "3. Karte und Verfügbarkeit",
        body: `Die Karte zeigt alle verfügbaren Benutzer in deiner Nähe mit farbigen Symbolen:

• Blau — Männlicher Biker
• Rosa — Weibliche/r Biker/Sozia
• Lila — Paar

Schalte deine Verfügbarkeit mit dem Schalter "Ich bin verfügbar" oben um. Verwende Filter, um nur Biker, nur Sozias oder beide anzuzeigen. Tippe auf ein Symbol auf der Karte, um das Profil eines Benutzers anzuzeigen und ihm eine Nachricht zu senden.`,
      },
      {
        heading: "4. Biker-SOS",
        body: `Im Falle einer Straßenpanne nutze die SOS-Funktion im Ride-Tab:

1. Tippe auf die Schaltfläche "SOS senden"
2. Stelle deinen Suchradius ein (10-100 km)
3. Bestätige das Senden — alle Biker in Reichweite erhalten eine Benachrichtigung
4. Wer verfügbar ist, kann antworten und dir zu Hilfe kommen

Das SOS zeigt deinen genauen Standort auf der Karte, damit Helfer dich leicht finden können.`,
      },
      {
        heading: "5. Vorschläge",
        body: `Vorschläge ermöglichen es dir, Ausfahrten zu organisieren und Reisebegleiter zu finden:

Vorschlagstypen:
• FindAFriend — Du suchst andere Biker für eine gemeinsame Tour
• Sozia suchen — Du hast einen freien Sitz und suchst einen Beifahrer
• Hitcher — Du bietest jemandem eine Mitfahrgelegenheit an
• HitchHiker — Du suchst eine Mitfahrgelegenheit

Um einen Vorschlag zu erstellen: Tippe auf die "+"-Taste im Vorschläge-Tab, wähle den Typ, gib Titel, Beschreibung, Abfahrtsort und Zeit ein. Andere Benutzer können teilnehmen oder dich kontaktieren.`,
      },
      {
        heading: "6. Garage Match",
        body: `Garage Match ist ein automatisches System, das Biker und Sozias basierend auf Motorrad-Kompatibilität zusammenführt:

1. Füge deine Motorräder in der Garage hinzu (Profil-Tab → Garage)
2. Wenn du Sozia bist, gib deine Motorrad-Präferenzen in der Wunschliste an
3. Das System sucht automatisch nach kompatiblen Matches
4. Bei einem Match erhältst du eine Benachrichtigung
5. Du kannst den Match akzeptieren oder ablehnen
6. Wenn beide akzeptieren, öffnet sich ein privater Chat

Der Match berücksichtigt: Marke, Modell, Motorradtyp und Fahrstil.`,
      },
      {
        heading: "7. Privater Chat",
        body: `Der private Chat ermöglicht es dir, mit anderen Benutzern zu kommunizieren:

• Du kannst Textnachrichten senden
• Unterhaltungen sind nur für die Teilnehmer sichtbar
• Zugang zum Chat über: Benutzerprofil, akzeptierter Match oder Chat-Tab

Nachrichten werden in Echtzeit zugestellt. Du kannst auch deinen Standort teilen, um Treffen zu erleichtern.`,
      },
      {
        heading: "8. MotoClub",
        body: `MotoClubs sind Gruppen für Motorradfahrer derselben Marke oder Region:

• Suche deinen MotoClub im dedizierten Tab
• Beantrage die Mitgliedschaft — die Genehmigung kann automatisch oder manuell erfolgen
• Nach der Aufnahme hast du Zugang zum Gruppenchat des Clubs
• Verwende Hashtags (#), um Nachrichten nach Thema zu filtern
• Jeder Club zeigt die Mitgliederzahl und Markeninformationen an

Du kannst gleichzeitig mehreren MotoClubs angehören.`,
      },
      {
        heading: "9. Fotowettbewerb",
        body: `Jede Woche gibt es einen thematischen Fotowettbewerb:

1. Lade dein bestes Foto über die Schaltfläche im Contest-Tab hoch
2. Stimme für die Fotos anderer Benutzer ab (begrenzte Stimmen pro Tag)
3. Am Ende der Woche gewinnt das Foto mit den meisten Stimmen
4. Gewinner werden in der Gewinner-Halle angezeigt

Fotos müssen angemessen sein und den Community-Richtlinien entsprechen.`,
      },
      {
        heading: "10. GPS-Tracking",
        body: `Die Tracking-Funktion zeichnet deine Motorradstrecken auf:

1. Drücke im Ride-Tab auf "Tracking starten"
2. Die App zeichnet auf: Entfernung, Geschwindigkeit, Höhe und Dauer
3. Du kannst die GPS-Frequenz anpassen, um Akku zu sparen
4. Drücke "Tracking stoppen", um die Aufzeichnung zu beenden
5. Routen werden in deinem Verlauf gespeichert

Tracking-Daten fließen in deine Profilstatistiken ein (Gesamt-km, abgeschlossene Fahrten).`,
      },
      {
        heading: "11. Easter Eggs",
        body: `Verstreut über Europa gibt es virtuelle Easter Eggs zum Sammeln:

• Wenn du in der Nähe eines Easter Eggs bist, erhältst du eine Benachrichtigung
• Tippe auf "Sammeln!", um es deiner Sammlung hinzuzufügen
• Jedes Easter Egg ist Punkte wert
• Überprüfe den Zähler in deinem Profil, um zu sehen, wie viele du gefunden hast

Es ist eine unterhaltsame Art, während deiner Fahrten neue Gegenden zu entdecken!`,
      },
      {
        heading: "12. Einstellungen und Sprache",
        body: `In deinem Profil kannst du die App anpassen:

• Sprache — Wähle zwischen Italiano, English, Deutsch, Español und Français
• Profil bearbeiten — Bio, Fotos, Telefonnummer aktualisieren
• Garage — Verwalte deine Motorräder
• Sucheinstellungen — Wähle, ob nur Biker, nur Sozias oder beide angezeigt werden
• Spende — Unterstütze die App-Entwicklung

Ändere die Sprache über den Selektor in deinem Profil. Alle Bildschirme aktualisieren sich sofort.`,
      },
      {
        heading: "13. Sicherheit und Datenschutz",
        body: `BikerLink nimmt deine Sicherheit ernst:

• Dein Standort ist nur sichtbar, wenn du "verfügbar" bist
• Du kannst unangemessene Benutzer melden (Benutzerprofil → Melden)
• Fotos werden vor der Veröffentlichung moderiert
• Du kannst dein Konto jederzeit löschen (Profil → Konto löschen)
• Die Löschung ist nach 30 Tagen endgültig — du kannst sie durch Einloggen abbrechen
• Deine Daten sind gemäß der europäischen DSGVO geschützt

Bei Problemen nutze den Feedback-Bereich in deinem Profil.`,
      },
    ],
  },
  es: {
    title: "MANUAL DE USUARIO — ESPAÑOL",
    chapters: [
      {
        heading: "1. Registro e Inicio de Sesión",
        body: `Para usar BikerLink, descarga la app y crea una cuenta. En la pantalla de registro, elige tu tipo de usuario:

• Biker — Eres motociclista con tu propia moto
• Pasajera/o — Eres pasajero/a y buscas un viaje
• Pareja — Sois una pareja que viaja junta

Introduce tu nickname (único), email, contraseña, año de nacimiento y selecciona tu país y región. Después del registro, podrías recibir un código de verificación por email. Introdúcelo en la app para activar tu cuenta.

Para iniciar sesión después, usa tu email (o nickname) y contraseña. Si olvidas tu contraseña, usa la función "Contraseña olvidada" en la pantalla de inicio de sesión.`,
      },
      {
        heading: "2. Navegación de la App",
        body: `La app está organizada en pestañas en la barra inferior:

• Mapa — Visualiza los bikers y pasajeros disponibles en tu zona
• Propuestas — Crea y participa en propuestas de ruta, concentración o viaje compartido
• Chat — Mensajes privados y chats de grupo MotoClub
• Contest — Participa en concursos fotográficos semanales
• Perfil — Gestiona tu perfil, fotos, motos y ajustes`,
      },
      {
        heading: "3. Mapa y Disponibilidad",
        body: `El mapa muestra todos los usuarios disponibles en tu zona con iconos de colores:

• Azul — Biker masculino
• Rosa — Biker femenina/Pasajera
• Morado — Pareja

Activa/desactiva tu disponibilidad con el interruptor "Estoy disponible" arriba. Usa los filtros para mostrar solo bikers, solo pasajeros o ambos. Toca un icono en el mapa para ver el perfil del usuario y enviarle un mensaje.`,
      },
      {
        heading: "4. SOS Biker",
        body: `En caso de emergencia en la carretera, usa la función SOS desde la pestaña Ride:

1. Toca el botón "Lanzar SOS"
2. Establece tu radio de búsqueda (10-100 km)
3. Confirma el envío — todos los bikers en el radio recibirán una notificación
4. Los que estén disponibles podrán responder y venir en tu ayuda

El SOS muestra tu ubicación exacta en el mapa para que los rescatadores puedan encontrarte fácilmente.`,
      },
      {
        heading: "5. Propuestas",
        body: `Las propuestas te permiten organizar salidas y encontrar compañeros de viaje:

Tipos de propuesta:
• FindAFriend — Buscas otros bikers para una ruta en grupo
• Buscar Pasajera — Tienes el asiento libre y buscas un pasajero
• Hitcher — Ofreces un viaje a alguien
• HitchHiker — Buscas un viaje

Para crear una propuesta: toca el botón "+" en la pestaña Propuestas, elige el tipo, introduce título, descripción, lugar de salida y hora. Otros usuarios podrán participar o contactarte.`,
      },
      {
        heading: "6. Garage Match",
        body: `Garage Match es un sistema automático que empareja bikers y pasajeros basándose en la compatibilidad de motos:

1. Añade tus motos en el Garage (pestaña Perfil → Garage)
2. Si eres pasajero/a, indica tus preferencias de moto en la Wishlist
3. El sistema busca automáticamente emparejamientos compatibles
4. Cuando hay un match, recibes una notificación
5. Puedes aceptar o rechazar el match
6. Si ambos aceptan, se abre un chat privado

El match tiene en cuenta: marca, modelo, tipo de moto y estilo de conducción.`,
      },
      {
        heading: "7. Chat Privado",
        body: `El chat privado te permite comunicarte con otros usuarios:

• Puedes enviar mensajes de texto
• Las conversaciones solo son visibles para los participantes
• Accede al chat desde: perfil de un usuario, match aceptado o pestaña Chat

Los mensajes se entregan en tiempo real. También puedes compartir tu ubicación para facilitar los encuentros.`,
      },
      {
        heading: "8. MotoClub",
        body: `Los MotoClubs son grupos para motociclistas de la misma marca o zona:

• Busca tu MotoClub en la pestaña dedicada
• Solicita la membresía — la aprobación puede ser automática o manual
• Una vez inscrito, accede al chat grupal del club
• Usa hashtags (#) para filtrar mensajes por tema
• Cada club muestra el número de miembros y la información de la marca

Puedes pertenecer a varios MotoClubs simultáneamente.`,
      },
      {
        heading: "9. Concurso de Fotos",
        body: `Cada semana hay un concurso fotográfico temático:

1. Sube tu mejor foto desde el botón en la pestaña Contest
2. Vota las fotos de otros usuarios (votos limitados por día)
3. Al final de la semana, la foto con más votos gana
4. Los ganadores se muestran en el Salón de Ganadores

Las fotos deben ser apropiadas y seguir las directrices de la comunidad.`,
      },
      {
        heading: "10. Seguimiento GPS",
        body: `La función de Tracking registra tus rutas en moto:

1. Desde la pestaña Ride, pulsa "Iniciar tracking"
2. La app registra: distancia, velocidad, altitud y duración
3. Puedes ajustar la frecuencia GPS para ahorrar batería
4. Pulsa "Parar tracking" para terminar la grabación
5. Las rutas se guardan en tu historial

Los datos de tracking contribuyen a tus estadísticas del perfil (km totales, rutas completadas).`,
      },
      {
        heading: "11. Easter Eggs",
        body: `Dispersos por Europa hay Easter Eggs virtuales para coleccionar:

• Cuando estés cerca de un Easter Egg, recibirás una notificación
• Toca "¡Recoger!" para añadirlo a tu colección
• Cada Easter Egg vale puntos
• Comprueba el contador en tu perfil para ver cuántos has encontrado

¡Es una forma divertida de explorar nuevas zonas durante tus rutas!`,
      },
      {
        heading: "12. Ajustes e Idioma",
        body: `En tu perfil puedes personalizar la app:

• Idioma — Elige entre Italiano, English, Deutsch, Español y Français
• Editar perfil — Actualiza bio, fotos, número de teléfono
• Garage — Gestiona tus motos
• Preferencias de búsqueda — Elige ver solo bikers, solo pasajeros o ambos
• Donación — Apoya el desarrollo de la app

Cambia el idioma desde el selector en tu perfil. Todas las pantallas se actualizan inmediatamente.`,
      },
      {
        heading: "13. Seguridad y Privacidad",
        body: `BikerLink se toma en serio tu seguridad:

• Tu ubicación solo es visible cuando estás "disponible"
• Puedes reportar usuarios inapropiados (Perfil del usuario → Reportar)
• Las fotos son moderadas antes de la publicación
• Puedes eliminar tu cuenta en cualquier momento (Perfil → Eliminar Cuenta)
• La eliminación es definitiva después de 30 días — puedes cancelarla iniciando sesión
• Tus datos están protegidos según la normativa europea GDPR

Para cualquier problema, usa la sección Feedback en tu perfil.`,
      },
    ],
  },
  fr: {
    title: "MANUEL UTILISATEUR — FRANÇAIS",
    chapters: [
      {
        heading: "1. Inscription et Connexion",
        body: `Pour utiliser BikerLink, téléchargez l'application et créez un compte. Sur l'écran d'inscription, choisissez votre type d'utilisateur :

• Biker — Vous êtes motocycliste avec votre propre moto
• Passagère/er — Vous êtes passager/ère et cherchez un trajet
• Couple — Vous êtes un couple qui roule ensemble

Entrez votre pseudo (unique), email, mot de passe, année de naissance et sélectionnez votre pays et région. Après l'inscription, vous pourriez recevoir un code de vérification par email. Entrez-le dans l'application pour activer votre compte.

Pour vous connecter ultérieurement, utilisez votre email (ou pseudo) et mot de passe. Si vous oubliez votre mot de passe, utilisez la fonction "Mot de passe oublié" sur l'écran de connexion.`,
      },
      {
        heading: "2. Navigation de l'App",
        body: `L'application est organisée en onglets dans la barre inférieure :

• Carte — Visualisez les bikers et passagers disponibles dans votre zone
• Propositions — Créez et participez à des propositions de balade, rassemblement ou covoiturage
• Chat — Messages privés et chats de groupe MotoClub
• Contest — Participez aux concours photo hebdomadaires
• Profil — Gérez votre profil, photos, motos et paramètres`,
      },
      {
        heading: "3. Carte et Disponibilité",
        body: `La carte montre tous les utilisateurs disponibles dans votre zone avec des icônes colorées :

• Bleu — Biker masculin
• Rose — Biker féminine/Passagère
• Violet — Couple

Activez/désactivez votre disponibilité avec le commutateur "Je suis disponible" en haut. Utilisez les filtres pour afficher uniquement les bikers, les passagers ou les deux. Touchez une icône sur la carte pour voir le profil d'un utilisateur et lui envoyer un message.`,
      },
      {
        heading: "4. SOS Biker",
        body: `En cas d'urgence routière, utilisez la fonction SOS depuis l'onglet Ride :

1. Touchez le bouton "Lancer SOS"
2. Définissez votre rayon de recherche (10-100 km)
3. Confirmez l'envoi — tous les bikers dans le rayon recevront une notification
4. Ceux qui sont disponibles pourront répondre et venir à votre aide

Le SOS montre votre position exacte sur la carte pour que les secouristes puissent vous trouver facilement.`,
      },
      {
        heading: "5. Propositions",
        body: `Les propositions vous permettent d'organiser des sorties et de trouver des compagnons de route :

Types de proposition :
• FindAFriend — Vous cherchez d'autres bikers pour une balade en groupe
• Chercher Passagère — Vous avez le siège libre et cherchez un passager
• Hitcher — Vous offrez un trajet à quelqu'un
• HitchHiker — Vous cherchez un trajet

Pour créer une proposition : touchez le bouton "+" dans l'onglet Propositions, choisissez le type, entrez titre, description, lieu de départ et horaire. Les autres utilisateurs pourront participer ou vous contacter.`,
      },
      {
        heading: "6. Garage Match",
        body: `Garage Match est un système automatique qui associe bikers et passagers selon la compatibilité des motos :

1. Ajoutez vos motos dans le Garage (onglet Profil → Garage)
2. Si vous êtes passager/ère, indiquez vos préférences de moto dans la Wishlist
3. Le système recherche automatiquement des correspondances compatibles
4. Lors d'un match, vous recevez une notification
5. Vous pouvez accepter ou refuser le match
6. Si les deux acceptent, un chat privé s'ouvre

Le match tient compte de : marque, modèle, type de moto et style de conduite.`,
      },
      {
        heading: "7. Chat Privé",
        body: `Le chat privé vous permet de communiquer avec les autres utilisateurs :

• Vous pouvez envoyer des messages texte
• Les conversations ne sont visibles que par les participants
• Accédez au chat depuis : le profil d'un utilisateur, un match accepté, ou l'onglet Chat

Les messages sont livrés en temps réel. Vous pouvez aussi partager votre position pour faciliter les rencontres.`,
      },
      {
        heading: "8. MotoClub",
        body: `Les MotoClubs sont des groupes pour motocyclistes de la même marque ou zone :

• Recherchez votre MotoClub dans l'onglet dédié
• Demandez l'adhésion — l'approbation peut être automatique ou manuelle
• Une fois inscrit, accédez au chat de groupe du club
• Utilisez les hashtags (#) pour filtrer les messages par sujet
• Chaque club affiche le nombre de membres et les informations de la marque

Vous pouvez faire partie de plusieurs MotoClubs simultanément.`,
      },
      {
        heading: "9. Concours Photo",
        body: `Chaque semaine, il y a un concours photo thématique :

1. Téléchargez votre meilleure photo depuis le bouton dans l'onglet Contest
2. Votez pour les photos des autres utilisateurs (votes limités par jour)
3. À la fin de la semaine, la photo avec le plus de votes gagne
4. Les gagnants sont affichés dans le Hall des Gagnants

Les photos doivent être appropriées et respecter les directives de la communauté.`,
      },
      {
        heading: "10. Suivi GPS",
        body: `La fonction Tracking enregistre vos parcours à moto :

1. Depuis l'onglet Ride, appuyez sur "Démarrer le suivi"
2. L'app enregistre : distance, vitesse, altitude et durée
3. Vous pouvez ajuster la fréquence GPS pour économiser la batterie
4. Appuyez sur "Arrêter le suivi" pour terminer l'enregistrement
5. Les parcours sont sauvegardés dans votre historique

Les données de suivi contribuent à vos statistiques de profil (km totaux, trajets effectués).`,
      },
      {
        heading: "11. Easter Eggs",
        body: `Dispersés à travers l'Europe, il y a des Easter Eggs virtuels à collecter :

• Quand vous êtes près d'un Easter Egg, vous recevez une notification
• Touchez "Collecter !" pour l'ajouter à votre collection
• Chaque Easter Egg vaut des points
• Vérifiez le compteur dans votre profil pour voir combien vous en avez trouvé

C'est une façon amusante d'explorer de nouvelles zones lors de vos balades !`,
      },
      {
        heading: "12. Paramètres et Langue",
        body: `Dans votre profil, vous pouvez personnaliser l'application :

• Langue — Choisissez entre Italiano, English, Deutsch, Español et Français
• Modifier le profil — Mettez à jour la bio, les photos, le numéro de téléphone
• Garage — Gérez vos motos
• Préférences de recherche — Choisissez de voir uniquement les bikers, les passagers ou les deux
• Don — Soutenez le développement de l'application

Changez la langue depuis le sélecteur dans votre profil. Tous les écrans se mettent à jour immédiatement.`,
      },
      {
        heading: "13. Sécurité et Confidentialité",
        body: `BikerLink prend votre sécurité au sérieux :

• Votre position n'est visible que lorsque vous êtes "disponible"
• Vous pouvez signaler les utilisateurs inappropriés (Profil utilisateur → Signaler)
• Les photos sont modérées avant publication
• Vous pouvez supprimer votre compte à tout moment (Profil → Supprimer le compte)
• La suppression est définitive après 30 jours — vous pouvez l'annuler en vous connectant
• Vos données sont protégées conformément au règlement européen RGPD

Pour tout problème, utilisez la section Feedback dans votre profil.`,
      },
    ],
  },
};

function generatePDF() {
  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 50, right: 50 },
    info: {
      Title: "BikerLink - User Manual",
      Author: "BikerLink Team",
      Subject: "Complete user manual in 5 languages",
    },
  });

  const stream = fs.createWriteStream(OUTPUT_PATH);
  doc.pipe(stream);

  doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK_BG);
  const cx = doc.page.width / 2;
  doc.fontSize(52).fillColor(ORANGE).text("BikerLink", 0, 200, { align: "center" });
  doc.fontSize(18).fillColor(WHITE).text("U'll never ride alone", 0, 270, { align: "center" });
  doc.moveDown(4);
  doc.fontSize(14).fillColor(LIGHT_TEXT).text("MANUALE UTENTE / USER MANUAL", 0, 360, { align: "center" });
  doc.text("BENUTZERHANDBUCH / MANUAL DE USUARIO / MANUEL UTILISATEUR", 0, 385, { align: "center" });
  doc.moveDown(4);
  doc.fontSize(11).fillColor("#888888").text(`v1.0 — ${new Date().toLocaleDateString("it-IT")}`, 0, 500, { align: "center" });
  doc.fontSize(10).text("IT | EN | DE | ES | FR", 0, 520, { align: "center" });
  doc.fontSize(9).fillColor("#666666").text("www.bikerlink.it", 0, 700, { align: "center" });

  const langOrder: (keyof typeof MANUAL)[] = ["it", "en", "de", "es", "fr"];

  for (let li = 0; li < langOrder.length; li++) {
    const lang = langOrder[li];
    const section = MANUAL[lang];
    const sectionColor = SECTION_COLORS[li % SECTION_COLORS.length];

    doc.addPage();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK_BG);
    doc.rect(0, 0, doc.page.width, 6).fill(sectionColor);

    doc.fontSize(28).fillColor(sectionColor).text(section.title, 50, 80, { align: "left" });
    doc.moveTo(50, 120).lineTo(doc.page.width - 50, 120).strokeColor(sectionColor).lineWidth(2).stroke();
    doc.moveDown(2);

    for (const chapter of section.chapters) {
      const currentY = doc.y;
      if (currentY > doc.page.height - 200) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK_BG);
        doc.rect(0, 0, doc.page.width, 4).fill(sectionColor);
        doc.y = 50;
      }

      doc.fontSize(15).fillColor(sectionColor).text(chapter.heading, 50, doc.y, {
        width: doc.page.width - 100,
      });
      doc.moveDown(0.5);

      doc.fontSize(10).fillColor(LIGHT_TEXT).text(chapter.body, 50, doc.y, {
        width: doc.page.width - 100,
        lineGap: 3,
      });
      doc.moveDown(1.5);
    }
  }

  doc.addPage();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK_BG);
  doc.fontSize(28).fillColor(ORANGE).text("BikerLink", 0, 300, { align: "center" });
  doc.fontSize(14).fillColor(WHITE).text("U'll never ride alone", 0, 345, { align: "center" });
  doc.moveDown(2);
  doc.fontSize(11).fillColor(LIGHT_TEXT).text("bikerlinkapp@gmail.com", 0, 410, { align: "center" });
  doc.fontSize(10).fillColor("#888888").text(`© ${new Date().getFullYear()} BikerLink — Tutti i diritti riservati`, 0, 440, { align: "center" });

  doc.end();

  return new Promise<void>((resolve, reject) => {
    stream.on("finish", () => {
      const stats = fs.statSync(OUTPUT_PATH);
      console.log(`PDF generated: ${OUTPUT_PATH} (${(stats.size / 1024).toFixed(1)} KB)`);
      resolve();
    });
    stream.on("error", reject);
  });
}

generatePDF().catch((err) => {
  console.error("Error generating PDF:", err);
  process.exit(1);
});
