const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'server', 'public');

function addHeader(doc, title, subtitle) {
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a1a2e').text('BikerLink', { align: 'center' });
  doc.font('Helvetica').fontSize(12).fillColor('#555').text("U'll never ride alone", { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#1a1a2e').lineWidth(1.5).stroke();
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a2e').text(title, { align: 'center' });
  if (subtitle) {
    doc.font('Helvetica').fontSize(10).fillColor('#555').text(subtitle, { align: 'center' });
  }
  doc.moveDown(1);
}

function addFooter(doc) {
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text(text);
  doc.moveDown(0.3);
}

function langTitle(doc, text) {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#1a1a2e').text(text, { align: 'center' });
  doc.moveDown(0.8);
}

function body(doc, text) {
  doc.font('Helvetica').fontSize(10).fillColor('#333').text(text, { align: 'left', lineGap: 2 });
}

function bullet(doc, items) {
  items.forEach(item => {
    doc.font('Helvetica').fontSize(10).fillColor('#333').text('• ' + item, { indent: 10, lineGap: 2 });
  });
}

function numbered(doc, items) {
  items.forEach((item, i) => {
    doc.font('Helvetica').fontSize(10).fillColor('#333').text((i + 1) + '. ' + item, { indent: 10, lineGap: 2 });
  });
}

// ============================================================
// MANUAL
// ============================================================
function generateManual() {
  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(fs.createWriteStream(path.join(OUT_DIR, 'bikerlink-manual.pdf')));
  addFooter(doc);

  // Cover
  doc.moveDown(3);
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#1a1a2e').text('BikerLink', { align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(14).fillColor('#555').text("U'll never ride alone", { align: 'center' });
  doc.moveDown(1.5);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#1a1a2e').lineWidth(2).stroke();
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e').text('MANUALE UTENTE / USER MANUAL', { align: 'center' });
  doc.font('Helvetica').fontSize(12).fillColor('#555').text('BENUTZERHANDBUCH / MANUAL DE USUARIO / MANUEL UTILISATEUR', { align: 'center' });
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(10).fillColor('#777').text('v1.0 — 16/03/2026', { align: 'center' });
  doc.text('IT | EN | DE | ES | FR', { align: 'center' });
  doc.moveDown(0.5);
  doc.text('www.bikerlink.it', { align: 'center' });

  // ITALIAN
  langTitle(doc, 'MANUALE UTENTE — ITALIANO');

  sectionTitle(doc, '1. Registrazione e Accesso');
  body(doc, 'Per utilizzare BikerLink, scarica l\'app e crea un account. Nella schermata di registrazione, scegli il tuo tipo di utente:');
  bullet(doc, ['Biker — Sei un motociclista con la tua moto', 'Zavorrina/o — Sei un passeggero in cerca di un passaggio', 'Coppia — Siete una coppia che viaggia insieme']);
  doc.moveDown(0.3);
  body(doc, 'Inserisci il tuo nickname (unico), email, password, anno di nascita e seleziona il tuo paese e la tua regione. Dopo la registrazione, potresti ricevere un codice di verifica via email. Inseriscilo nell\'app per attivare il tuo account.\nPer accedere in futuro, usa la tua email (o nickname) e password. Se dimentichi la password, usa la funzione "Password dimenticata" nella schermata di login.');

  sectionTitle(doc, '2. Navigazione dell\'App');
  body(doc, 'L\'app è organizzata in tab nella barra inferiore:');
  bullet(doc, ['Mappa — Visualizza i biker e le zavorrine disponibili nella tua zona', 'Proposte — Crea e partecipa a proposte di giro, raduno o passaggio', 'Chat — Messaggi privati e chat di gruppo MotoClub', 'Contest — Partecipa ai contest fotografici settimanali', 'Profilo — Gestisci il tuo profilo, le foto, le moto e le impostazioni']);

  sectionTitle(doc, '3. Mappa e Disponibilità');
  body(doc, 'La mappa mostra tutti gli utenti disponibili nella tua zona con icone colorate:');
  bullet(doc, ['Blu — Biker maschio', 'Rosa — Zavorrina/Biker femmina', 'Viola — Coppia']);
  doc.moveDown(0.3);
  body(doc, 'Puoi attivare/disattivare la tua disponibilità con il toggle "Sono disponibile" in alto. Usa i filtri per mostrare solo biker, solo zavorrine o entrambi. Tocca un\'icona sulla mappa per vedere il profilo dell\'utente e inviargli un messaggio.');

  sectionTitle(doc, '4. SOS Biker');
  body(doc, 'In caso di emergenza stradale, usa la funzione SOS dalla tab Ride:');
  numbered(doc, ['Tocca il pulsante "Lancia SOS"', 'Imposta il raggio di ricerca (10-100 km)', 'Conferma l\'invio — tutti i biker nel raggio riceveranno una notifica', 'Chi è disponibile potrà rispondere e venire in tuo soccorso']);
  doc.moveDown(0.3);
  body(doc, 'L\'SOS mostra la tua posizione esatta sulla mappa e permette ai soccorritori di raggiungerti facilmente.');

  sectionTitle(doc, '5. Proposte');
  body(doc, 'Le proposte ti permettono di organizzare uscite e trovare compagni di viaggio:\nTipi di proposta:');
  bullet(doc, ['FindAFriend — Cerchi altri biker per un giro insieme', 'Trova Zavorrina — Hai la sella libera e cerchi un passeggero', 'Hitcher — Offri un passaggio a qualcuno', 'HitchHiker — Cerchi un passaggio']);
  doc.moveDown(0.3);
  body(doc, 'Per creare una proposta: tocca il pulsante "+" nella tab Proposte, scegli il tipo, inserisci titolo, descrizione, luogo di partenza e orario. Gli altri utenti potranno partecipare o contattarti.');

  sectionTitle(doc, '6. Match Garage');
  body(doc, 'Il Match Garage è un sistema automatico che abbina biker e zavorrine in base alla compatibilità delle moto:');
  numbered(doc, ['Aggiungi le tue moto nel Garage (tab Profilo → Garage)', 'Se sei una zavorrina, indica le tue preferenze di moto nella Wishlist', 'Il sistema cerca automaticamente abbinamenti compatibili', 'Quando c\'è un match, ricevi una notifica', 'Puoi accettare o rifiutare il match', 'Se entrambi accettate, si apre una chat privata']);
  doc.moveDown(0.3);
  body(doc, 'Il match tiene conto di: marca, modello, tipo di moto e stile di guida.');

  sectionTitle(doc, '7. Chat Privata');
  body(doc, 'La chat privata ti permette di comunicare con gli altri utenti:');
  bullet(doc, ['Puoi inviare messaggi di testo', 'Le conversazioni sono visibili solo ai partecipanti', 'Puoi accedere alla chat da: profilo di un utente, match accettato, o dalla tab Chat']);
  doc.moveDown(0.3);
  body(doc, 'I messaggi vengono consegnati in tempo reale. Puoi anche inviare la tua posizione per facilitare gli incontri.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'I MotoClub sono gruppi per motociclisti dello stesso brand o della stessa zona:');
  bullet(doc, ['Cerca il tuo MotoClub nella tab dedicata', 'Richiedi l\'iscrizione — l\'approvazione è automatica o manuale', 'Una volta iscritto, accedi alla chat di gruppo del club', 'Usa gli hashtag (#) per filtrare i messaggi per argomento', 'Ogni club mostra il numero di membri e le informazioni del brand']);
  doc.moveDown(0.3);
  body(doc, 'Puoi far parte di più MotoClub contemporaneamente.');

  sectionTitle(doc, '9. Contest Foto');
  body(doc, 'Ogni settimana c\'è un contest fotografico a tema:');
  numbered(doc, ['Carica la tua foto migliore dal pulsante nella tab Contest', 'Vota le foto degli altri utenti (hai un numero limitato di voti al giorno)', 'Alla fine della settimana, la foto con più voti vince', 'I vincitori vengono mostrati nell\'Albo dei Vincitori']);
  doc.moveDown(0.3);
  body(doc, 'Le foto devono essere appropriate e rispettare le linee guida della community.');

  sectionTitle(doc, '10. Tracking GPS');
  body(doc, 'La funzione Tracking registra i tuoi percorsi in moto:');
  numbered(doc, ['Dalla tab Ride, premi "Avvia tracking"', 'L\'app registra: distanza, velocità, altitudine e durata', 'Puoi regolare la frequenza GPS per risparmiare batteria', 'Premi "Ferma tracking" per terminare la registrazione', 'I percorsi vengono salvati nella tua cronologia']);
  doc.moveDown(0.3);
  body(doc, 'I dati di tracking contribuiscono alle tue statistiche nel profilo (km totali, giri fatti).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Sparsi per l\'Europa ci sono degli Easter Eggs virtuali da raccogliere:');
  bullet(doc, ['Quando sei vicino a un Easter Egg, ricevi una notifica', 'Tocca "Raccogli!" per aggiungerlo alla tua collezione', 'Ogni Easter Egg vale dei punti', 'Controlla il contatore nel tuo profilo per vedere quanti ne hai trovati']);
  doc.moveDown(0.3);
  body(doc, 'È un modo divertente per esplorare nuove zone durante i tuoi giri!');

  sectionTitle(doc, '12. Impostazioni e Lingua');
  body(doc, 'Nel tuo profilo puoi personalizzare l\'app:');
  bullet(doc, ['Lingua — Scegli tra Italiano, English, Deutsch, Español e Français', 'Modifica profilo — Aggiorna bio, foto, telefono', 'Garage — Gestisci le tue moto', 'Preferenze di ricerca — Scegli se vedere solo biker, solo zavorrine o entrambi']);
  doc.moveDown(0.3);
  body(doc, 'La lingua si cambia dal selettore nel profilo. Tutte le schermate si aggiornano immediatamente.');

  sectionTitle(doc, '13. Sicurezza e Privacy');
  body(doc, 'BikerLink prende seriamente la tua sicurezza:');
  bullet(doc, ['La tua posizione è visibile solo quando sei "disponibile"', 'Puoi segnalare utenti inappropriati (Profilo utente → Segnala)', 'Le foto vengono moderate prima della pubblicazione', 'Puoi eliminare il tuo account in qualsiasi momento (Profilo → Elimina Account)', 'L\'eliminazione è definitiva dopo 30 giorni — puoi annullarla facendo il login', 'I tuoi dati sono protetti secondo la normativa europea GDPR']);
  doc.moveDown(0.3);
  body(doc, 'Per qualsiasi problema, usa la sezione Feedback nel profilo.');

  // ENGLISH
  langTitle(doc, 'USER MANUAL — ENGLISH');

  sectionTitle(doc, '1. Registration and Login');
  body(doc, 'To use BikerLink, download the app and create an account. On the registration screen, choose your user type:');
  bullet(doc, ['Biker — You\'re a motorcyclist with your own bike', 'Pillion — You\'re a passenger looking for a ride', 'Couple — You\'re a couple riding together']);
  doc.moveDown(0.3);
  body(doc, 'Enter your nickname (unique), email, password, birth year and select your country and region. After registration, you may receive a verification code via email. Enter it in the app to activate your account.\nTo log in later, use your email (or nickname) and password. If you forget your password, use the "Forgot password" feature on the login screen.');

  sectionTitle(doc, '2. App Navigation');
  body(doc, 'The app is organized in tabs at the bottom bar:');
  bullet(doc, ['Map — View available bikers and pillions in your area', 'Proposals — Create and join ride proposals, rallies or ride-sharing', 'Chat — Private messages and MotoClub group chats', 'Contest — Participate in weekly photo contests', 'Profile — Manage your profile, photos, motorcycles and settings']);

  sectionTitle(doc, '3. Map and Availability');
  body(doc, 'The map shows all available users in your area with colored icons:');
  bullet(doc, ['Blue — Male biker', 'Pink — Female biker/Pillion', 'Purple — Couple']);
  doc.moveDown(0.3);
  body(doc, 'Toggle your availability with the "I\'m available" switch at the top. Use filters to show only bikers, only pillions, or both. Tap an icon on the map to view a user\'s profile and send them a message.');

  sectionTitle(doc, '4. Biker SOS');
  body(doc, 'In case of a roadside emergency, use the SOS feature from the Ride tab:');
  numbered(doc, ['Tap the "Launch SOS" button', 'Set your search radius (10-100 km)', 'Confirm the send — all bikers within range will receive a notification', 'Those available can respond and come to your aid']);
  doc.moveDown(0.3);
  body(doc, 'The SOS shows your exact location on the map, making it easy for rescuers to reach you.');

  sectionTitle(doc, '5. Proposals');
  body(doc, 'Proposals let you organize outings and find travel companions:\nProposal types:');
  bullet(doc, ['FindAFriend — Looking for other bikers for a group ride', 'Find Pillion — You have a free seat and are looking for a passenger', 'Hitcher — You\'re offering a ride to someone', 'HitchHiker — You\'re looking for a ride']);
  doc.moveDown(0.3);
  body(doc, 'To create a proposal: tap the "+" button in the Proposals tab, choose the type, enter title, description, departure location and time. Other users can join or contact you.');

  sectionTitle(doc, '6. Garage Match');
  body(doc, 'Garage Match is an automatic system that pairs bikers and pillions based on motorcycle compatibility:');
  numbered(doc, ['Add your motorcycles in the Garage (Profile tab → Garage)', 'If you\'re a pillion, set your motorcycle preferences in the Wishlist', 'The system automatically searches for compatible matches', 'When there\'s a match, you receive a notification', 'You can accept or reject the match', 'If both accept, a private chat opens']);
  doc.moveDown(0.3);
  body(doc, 'The match considers: brand, model, motorcycle type and riding style.');

  sectionTitle(doc, '7. Private Chat');
  body(doc, 'Private chat allows you to communicate with other users:');
  bullet(doc, ['You can send text messages', 'Conversations are visible only to participants', 'Access chat from: a user\'s profile, an accepted match, or the Chat tab']);
  doc.moveDown(0.3);
  body(doc, 'Messages are delivered in real-time. You can also share your location to facilitate meetups.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'MotoClubs are groups for motorcyclists of the same brand or area:');
  bullet(doc, ['Search for your MotoClub in the dedicated tab', 'Request membership — approval may be automatic or manual', 'Once enrolled, access the club\'s group chat', 'Use hashtags (#) to filter messages by topic', 'Each club shows member count and brand information']);
  doc.moveDown(0.3);
  body(doc, 'You can be part of multiple MotoClubs simultaneously.');

  sectionTitle(doc, '9. Photo Contest');
  body(doc, 'Every week there\'s a themed photo contest:');
  numbered(doc, ['Upload your best photo from the button in the Contest tab', 'Vote for other users\' photos (limited votes per day)', 'At the end of the week, the photo with the most votes wins', 'Winners are displayed in the Winners Hall']);
  doc.moveDown(0.3);
  body(doc, 'Photos must be appropriate and follow community guidelines.');

  sectionTitle(doc, '10. GPS Tracking');
  body(doc, 'The Tracking feature records your motorcycle routes:');
  numbered(doc, ['From the Ride tab, press "Start tracking"', 'The app records: distance, speed, altitude and duration', 'You can adjust GPS frequency to save battery', 'Press "Stop tracking" to end the recording', 'Routes are saved in your history']);
  doc.moveDown(0.3);
  body(doc, 'Tracking data contributes to your profile statistics (total km, rides completed).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Scattered across Europe are virtual Easter Eggs to collect:');
  bullet(doc, ['When you\'re near an Easter Egg, you receive a notification', 'Tap "Collect!" to add it to your collection', 'Each Easter Egg is worth points', 'Check the counter in your profile to see how many you\'ve found']);
  doc.moveDown(0.3);
  body(doc, 'It\'s a fun way to explore new areas during your rides!');

  sectionTitle(doc, '12. Settings and Language');
  body(doc, 'In your profile you can customize the app:');
  bullet(doc, ['Language — Choose between Italiano, English, Deutsch, Español and Français', 'Edit profile — Update bio, photos, phone number', 'Garage — Manage your motorcycles', 'Search preferences — Choose to see only bikers, only pillions, or both']);
  doc.moveDown(0.3);
  body(doc, 'Change language from the selector in your profile. All screens update immediately.');

  sectionTitle(doc, '13. Security and Privacy');
  body(doc, 'BikerLink takes your security seriously:');
  bullet(doc, ['Your location is visible only when you\'re "available"', 'You can report inappropriate users (User profile → Report)', 'Photos are moderated before publication', 'You can delete your account at any time (Profile → Delete Account)', 'Deletion is permanent after 30 days — you can cancel by logging in', 'Your data is protected under European GDPR regulations']);
  doc.moveDown(0.3);
  body(doc, 'For any issues, use the Feedback section in your profile.');

  // GERMAN
  langTitle(doc, 'BENUTZERHANDBUCH — DEUTSCH');

  sectionTitle(doc, '1. Registrierung und Anmeldung');
  body(doc, 'Um BikerLink zu nutzen, lade die App herunter und erstelle ein Konto. Auf dem Registrierungsbildschirm wähle deinen Benutzertyp:');
  bullet(doc, ['Biker — Du bist Motorradfahrer mit eigenem Motorrad', 'Sozia/Sozius — Du bist Mitfahrer und suchst eine Mitfahrgelegenheit', 'Paar — Ihr seid ein Paar, das gemeinsam fährt']);
  doc.moveDown(0.3);
  body(doc, 'Gib deinen Nickname (einzigartig), E-Mail, Passwort, Geburtsjahr ein und wähle dein Land und deine Region. Nach der Registrierung erhältst du möglicherweise einen Bestätigungscode per E-Mail. Gib ihn in der App ein, um dein Konto zu aktivieren.\nZum späteren Anmelden nutze deine E-Mail (oder Nickname) und dein Passwort. Wenn du dein Passwort vergisst, nutze die Funktion "Passwort vergessen" auf dem Login-Bildschirm.');

  sectionTitle(doc, '2. App-Navigation');
  body(doc, 'Die App ist in Tabs in der unteren Leiste organisiert:');
  bullet(doc, ['Karte — Zeige verfügbare Biker und Sozias in deiner Nähe', 'Vorschläge — Erstelle und nimm an Ausflügen, Treffen oder Mitfahrgelegenheiten teil', 'Chat — Private Nachrichten und MotoClub-Gruppenchats', 'Contest — Nimm an wöchentlichen Fotocontests teil', 'Profil — Verwalte dein Profil, Fotos, Motorräder und Einstellungen']);

  sectionTitle(doc, '3. Karte und Verfügbarkeit');
  body(doc, 'Die Karte zeigt alle verfügbaren Nutzer in deiner Nähe mit farbigen Symbolen:');
  bullet(doc, ['Blau — Männlicher Biker', 'Rosa — Weibliche Bikerin/Sozia', 'Lila — Paar']);
  doc.moveDown(0.3);
  body(doc, 'Aktiviere/deaktiviere deine Verfügbarkeit mit dem Schalter "Ich bin verfügbar" oben. Nutze Filter, um nur Biker, nur Sozias oder beide anzuzeigen. Tippe auf ein Symbol auf der Karte, um das Profil eines Nutzers anzuzeigen und ihm eine Nachricht zu senden.');

  sectionTitle(doc, '4. Biker-SOS');
  body(doc, 'Im Falle eines Pannennotfalls nutze die SOS-Funktion aus dem Ride-Tab:');
  numbered(doc, ['Tippe auf die Schaltfläche "SOS starten"', 'Lege deinen Suchradius fest (10-100 km)', 'Bestätige das Senden — alle Biker im Radius erhalten eine Benachrichtigung', 'Wer verfügbar ist, kann antworten und zu Hilfe kommen']);
  doc.moveDown(0.3);
  body(doc, 'Das SOS zeigt deinen genauen Standort auf der Karte an, sodass Retter dich leicht finden können.');

  sectionTitle(doc, '5. Vorschläge');
  body(doc, 'Vorschläge ermöglichen es dir, Ausflüge zu organisieren und Reisegefährten zu finden:\nArt der Vorschläge:');
  bullet(doc, ['FindAFriend — Du suchst andere Biker für eine gemeinsame Tour', 'Sozia suchen — Du hast einen freien Sitz und suchst einen Mitfahrer', 'Hitcher — Du bietest jemandem eine Mitfahrgelegenheit', 'HitchHiker — Du suchst eine Mitfahrgelegenheit']);
  doc.moveDown(0.3);
  body(doc, 'Um einen Vorschlag zu erstellen: tippe auf die "+" Schaltfläche im Tab Vorschläge, wähle den Typ, gib Titel, Beschreibung, Abfahrtsort und Uhrzeit ein. Andere Nutzer können teilnehmen oder dich kontaktieren.');

  sectionTitle(doc, '6. Garage Match');
  body(doc, 'Garage Match ist ein automatisches System, das Biker und Sozias basierend auf Motorradkompatibilität zusammenbringt:');
  numbered(doc, ['Füge deine Motorräder in der Garage hinzu (Profil-Tab → Garage)', 'Wenn du Sozia bist, gib deine Motorradpräferenzen in der Wunschliste an', 'Das System sucht automatisch nach kompatiblen Übereinstimmungen', 'Bei einem Match erhältst du eine Benachrichtigung', 'Du kannst das Match annehmen oder ablehnen', 'Wenn beide akzeptieren, öffnet sich ein privater Chat']);
  doc.moveDown(0.3);
  body(doc, 'Das Match berücksichtigt: Marke, Modell, Motorradtyp und Fahrstil.');

  sectionTitle(doc, '7. Privater Chat');
  body(doc, 'Der private Chat ermöglicht dir die Kommunikation mit anderen Nutzern:');
  bullet(doc, ['Du kannst Textnachrichten senden', 'Gespräche sind nur für die Teilnehmer sichtbar', 'Zugriff auf den Chat über: ein Nutzerprofil, ein angenommenes Match oder den Chat-Tab']);
  doc.moveDown(0.3);
  body(doc, 'Nachrichten werden in Echtzeit zugestellt. Du kannst auch deinen Standort teilen, um Treffen zu erleichtern.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'MotoClubs sind Gruppen für Motorradfahrer derselben Marke oder Region:');
  bullet(doc, ['Suche deinen MotoClub im dedizierten Tab', 'Beantrage die Mitgliedschaft — die Genehmigung kann automatisch oder manuell erfolgen', 'Nach der Aufnahme hast du Zugang zum Gruppenchat des Clubs', 'Verwende Hashtags (#), um Nachrichten nach Themen zu filtern', 'Jeder Club zeigt die Mitgliederanzahl und Markeninformationen an']);
  doc.moveDown(0.3);
  body(doc, 'Du kannst gleichzeitig Mitglied mehrerer MotoClubs sein.');

  sectionTitle(doc, '9. Fotocontest');
  body(doc, 'Jede Woche gibt es einen thematischen Fotocontest:');
  numbered(doc, ['Lade dein bestes Foto über die Schaltfläche im Contest-Tab hoch', 'Stimme für die Fotos anderer Nutzer ab (begrenzte Stimmen pro Tag)', 'Am Ende der Woche gewinnt das Foto mit den meisten Stimmen', 'Die Gewinner werden in der Gewinnerhalle angezeigt']);
  doc.moveDown(0.3);
  body(doc, 'Fotos müssen angemessen sein und die Community-Richtlinien befolgen.');

  sectionTitle(doc, '10. GPS-Tracking');
  body(doc, 'Die Tracking-Funktion zeichnet deine Motorradrouten auf:');
  numbered(doc, ['Im Ride-Tab drücke "Tracking starten"', 'Die App zeichnet auf: Distanz, Geschwindigkeit, Höhe und Dauer', 'Du kannst die GPS-Frequenz anpassen, um Akku zu sparen', 'Drücke "Tracking stoppen", um die Aufzeichnung zu beenden', 'Routen werden in deinem Verlauf gespeichert']);
  doc.moveDown(0.3);
  body(doc, 'Tracking-Daten fließen in deine Profilstatistiken ein (Gesamt-km, absolvierte Fahrten).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Verstreut über Europa gibt es virtuelle Easter Eggs zum Sammeln:');
  bullet(doc, ['Wenn du in der Nähe eines Easter Eggs bist, erhältst du eine Benachrichtigung', 'Tippe auf "Sammeln!", um es deiner Sammlung hinzuzufügen', 'Jedes Easter Egg ist Punkte wert', 'Überprüfe den Zähler in deinem Profil, um zu sehen, wie viele du gefunden hast']);
  doc.moveDown(0.3);
  body(doc, 'Es ist eine unterhaltsame Art, während deiner Fahrten neue Gegenden zu entdecken!');

  sectionTitle(doc, '12. Einstellungen und Sprache');
  body(doc, 'In deinem Profil kannst du die App anpassen:');
  bullet(doc, ['Sprache — Wähle zwischen Italiano, English, Deutsch, Español und Français', 'Profil bearbeiten — Bio, Fotos, Telefonnummer aktualisieren', 'Garage — Verwalte deine Motorräder', 'Sucheinstellungen — Wähle, ob nur Biker, nur Sozias oder beide angezeigt werden']);
  doc.moveDown(0.3);
  body(doc, 'Ändere die Sprache über den Selektor in deinem Profil. Alle Bildschirme aktualisieren sich sofort.');

  sectionTitle(doc, '13. Sicherheit und Datenschutz');
  body(doc, 'BikerLink nimmt deine Sicherheit ernst:');
  bullet(doc, ['Dein Standort ist nur sichtbar, wenn du "verfügbar" bist', 'Du kannst unangemessene Benutzer melden (Benutzerprofil → Melden)', 'Fotos werden vor der Veröffentlichung moderiert', 'Du kannst dein Konto jederzeit löschen (Profil → Konto löschen)', 'Die Löschung ist nach 30 Tagen endgültig — du kannst sie durch Einloggen abbrechen', 'Deine Daten sind gemäß der europäischen DSGVO geschützt']);
  doc.moveDown(0.3);
  body(doc, 'Bei Problemen nutze den Feedback-Bereich in deinem Profil.');

  // SPANISH
  langTitle(doc, 'MANUAL DE USUARIO — ESPAÑOL');

  sectionTitle(doc, '1. Registro e Inicio de Sesión');
  body(doc, 'Para usar BikerLink, descarga la app y crea una cuenta. En la pantalla de registro, elige tu tipo de usuario:');
  bullet(doc, ['Biker — Eres motociclista con tu propia moto', 'Pasajera/o — Eres pasajero/a y buscas un viaje', 'Pareja — Sois una pareja que viaja junta']);
  doc.moveDown(0.3);
  body(doc, 'Introduce tu nickname (único), email, contraseña, año de nacimiento y selecciona tu país y región. Después del registro, podrías recibir un código de verificación por email. Introdúcelo en la app para activar tu cuenta.\nPara iniciar sesión después, usa tu email (o nickname) y contraseña. Si olvidas tu contraseña, usa la función "Contraseña olvidada" en la pantalla de inicio de sesión.');

  sectionTitle(doc, '2. Navegación de la App');
  body(doc, 'La app está organizada en pestañas en la barra inferior:');
  bullet(doc, ['Mapa — Visualiza los bikers y pasajeros disponibles en tu zona', 'Propuestas — Crea y participa en propuestas de ruta, concentración o viaje compartido', 'Chat — Mensajes privados y chats de grupo MotoClub', 'Contest — Participa en concursos fotográficos semanales', 'Perfil — Gestiona tu perfil, fotos, motos y ajustes']);

  sectionTitle(doc, '3. Mapa y Disponibilidad');
  body(doc, 'El mapa muestra todos los usuarios disponibles en tu zona con iconos de colores:');
  bullet(doc, ['Azul — Biker masculino', 'Rosa — Biker femenina/Pasajera', 'Morado — Pareja']);
  doc.moveDown(0.3);
  body(doc, 'Activa/desactiva tu disponibilidad con el interruptor "Estoy disponible" arriba. Usa los filtros para mostrar solo bikers, solo pasajeros o ambos. Toca un icono en el mapa para ver el perfil del usuario y enviarle un mensaje.');

  sectionTitle(doc, '4. SOS Biker');
  body(doc, 'En caso de emergencia en la carretera, usa la función SOS desde la pestaña Ride:');
  numbered(doc, ['Toca el botón "Lanzar SOS"', 'Establece tu radio de búsqueda (10-100 km)', 'Confirma el envío — todos los bikers en el radio recibirán una notificación', 'Los que estén disponibles podrán responder y venir en tu ayuda']);
  doc.moveDown(0.3);
  body(doc, 'El SOS muestra tu ubicación exacta en el mapa para que los rescatadores puedan encontrarte fácilmente.');

  sectionTitle(doc, '5. Propuestas');
  body(doc, 'Las propuestas te permiten organizar salidas y encontrar compañeros de viaje:\nTipos de propuesta:');
  bullet(doc, ['FindAFriend — Buscas otros bikers para una ruta en grupo', 'Buscar Pasajera — Tienes el asiento libre y buscas un pasajero', 'Hitcher — Ofreces un viaje a alguien', 'HitchHiker — Buscas un viaje']);
  doc.moveDown(0.3);
  body(doc, 'Para crear una propuesta: toca el botón "+" en la pestaña Propuestas, elige el tipo, introduce título, descripción, lugar de salida y hora. Otros usuarios podrán participar o contactarte.');

  sectionTitle(doc, '6. Garage Match');
  body(doc, 'Garage Match es un sistema automático que empareja bikers y pasajeros basándose en la compatibilidad de motos:');
  numbered(doc, ['Añade tus motos en el Garage (pestaña Perfil → Garage)', 'Si eres pasajero/a, indica tus preferencias de moto en la Wishlist', 'El sistema busca automáticamente emparejamientos compatibles', 'Cuando hay un match, recibes una notificación', 'Puedes aceptar o rechazar el match', 'Si ambos aceptan, se abre un chat privado']);
  doc.moveDown(0.3);
  body(doc, 'El match tiene en cuenta: marca, modelo, tipo de moto y estilo de conducción.');

  sectionTitle(doc, '7. Chat Privado');
  body(doc, 'El chat privado te permite comunicarte con otros usuarios:');
  bullet(doc, ['Puedes enviar mensajes de texto', 'Las conversaciones solo son visibles para los participantes', 'Accede al chat desde: perfil de un usuario, match aceptado o pestaña Chat']);
  doc.moveDown(0.3);
  body(doc, 'Los mensajes se entregan en tiempo real. También puedes compartir tu ubicación para facilitar los encuentros.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'Los MotoClubs son grupos para motociclistas de la misma marca o zona:');
  bullet(doc, ['Busca tu MotoClub en la pestaña dedicada', 'Solicita la membresía — la aprobación puede ser automática o manual', 'Una vez inscrito, accede al chat grupal del club', 'Usa hashtags (#) para filtrar mensajes por tema', 'Cada club muestra el número de miembros y la información de la marca']);
  doc.moveDown(0.3);
  body(doc, 'Puedes pertenecer a varios MotoClubs simultáneamente.');

  sectionTitle(doc, '9. Concurso de Fotos');
  body(doc, 'Cada semana hay un concurso fotográfico temático:');
  numbered(doc, ['Sube tu mejor foto desde el botón en la pestaña Contest', 'Vota las fotos de otros usuarios (votos limitados por día)', 'Al final de la semana, la foto con más votos gana', 'Los ganadores se muestran en el Salón de Ganadores']);
  doc.moveDown(0.3);
  body(doc, 'Las fotos deben ser apropiadas y seguir las directrices de la comunidad.');

  sectionTitle(doc, '10. Seguimiento GPS');
  body(doc, 'La función de Tracking registra tus rutas en moto:');
  numbered(doc, ['Desde la pestaña Ride, pulsa "Iniciar tracking"', 'La app registra: distancia, velocidad, altitud y duración', 'Puedes ajustar la frecuencia GPS para ahorrar batería', 'Pulsa "Parar tracking" para terminar la grabación', 'Las rutas se guardan en tu historial']);
  doc.moveDown(0.3);
  body(doc, 'Los datos de tracking contribuyen a tus estadísticas del perfil (km totales, rutas completadas).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Dispersos por Europa hay Easter Eggs virtuales para coleccionar:');
  bullet(doc, ['Cuando estés cerca de un Easter Egg, recibirás una notificación', 'Toca "¡Recoger!" para añadirlo a tu colección', 'Cada Easter Egg vale puntos', 'Comprueba el contador en tu perfil para ver cuántos has encontrado']);
  doc.moveDown(0.3);
  body(doc, '¡Es una forma divertida de explorar nuevas zonas durante tus rutas!');

  sectionTitle(doc, '12. Ajustes e Idioma');
  body(doc, 'En tu perfil puedes personalizar la app:');
  bullet(doc, ['Idioma — Elige entre Italiano, English, Deutsch, Español y Français', 'Editar perfil — Actualiza bio, fotos, número de teléfono', 'Garage — Gestiona tus motos', 'Preferencias de búsqueda — Elige ver solo bikers, solo pasajeros o ambos']);
  doc.moveDown(0.3);
  body(doc, 'Cambia el idioma desde el selector en tu perfil. Todas las pantallas se actualizan inmediatamente.');

  sectionTitle(doc, '13. Seguridad y Privacidad');
  body(doc, 'BikerLink se toma en serio tu seguridad:');
  bullet(doc, ['Tu ubicación solo es visible cuando estás "disponible"', 'Puedes reportar usuarios inapropiados (Perfil del usuario → Reportar)', 'Las fotos son moderadas antes de la publicación', 'Puedes eliminar tu cuenta en cualquier momento (Perfil → Eliminar Cuenta)', 'La eliminación es definitiva después de 30 días — puedes cancelarla iniciando sesión', 'Tus datos están protegidos según la normativa europea GDPR']);
  doc.moveDown(0.3);
  body(doc, 'Para cualquier problema, usa la sección Feedback en tu perfil.');

  // FRENCH
  langTitle(doc, 'MANUEL UTILISATEUR — FRANÇAIS');

  sectionTitle(doc, '1. Inscription et Connexion');
  body(doc, 'Pour utiliser BikerLink, téléchargez l\'application et créez un compte. Sur l\'écran d\'inscription, choisissez votre type d\'utilisateur :');
  bullet(doc, ['Biker — Vous êtes motocycliste avec votre propre moto', 'Passagère/er — Vous êtes passager/ère et cherchez un trajet', 'Couple — Vous êtes un couple qui roule ensemble']);
  doc.moveDown(0.3);
  body(doc, 'Entrez votre pseudo (unique), email, mot de passe, année de naissance et sélectionnez votre pays et région. Après l\'inscription, vous pourriez recevoir un code de vérification par email. Entrez-le dans l\'application pour activer votre compte.\nPour vous connecter ultérieurement, utilisez votre email (ou pseudo) et mot de passe. Si vous oubliez votre mot de passe, utilisez la fonction "Mot de passe oublié" sur l\'écran de connexion.');

  sectionTitle(doc, '2. Navigation de l\'App');
  body(doc, 'L\'application est organisée en onglets dans la barre inférieure :');
  bullet(doc, ['Carte — Visualisez les bikers et passagers disponibles dans votre zone', 'Propositions — Créez et participez à des propositions de balade, rassemblement ou covoiturage', 'Chat — Messages privés et chats de groupe MotoClub', 'Contest — Participez aux concours photo hebdomadaires', 'Profil — Gérez votre profil, photos, motos et paramètres']);

  sectionTitle(doc, '3. Carte et Disponibilité');
  body(doc, 'La carte montre tous les utilisateurs disponibles dans votre zone avec des icônes colorées :');
  bullet(doc, ['Bleu — Biker masculin', 'Rose — Biker féminine/Passagère', 'Violet — Couple']);
  doc.moveDown(0.3);
  body(doc, 'Activez/désactivez votre disponibilité avec le commutateur "Je suis disponible" en haut. Utilisez les filtres pour afficher uniquement les bikers, les passagers ou les deux. Touchez une icône sur la carte pour voir le profil d\'un utilisateur et lui envoyer un message.');

  sectionTitle(doc, '4. SOS Biker');
  body(doc, 'En cas d\'urgence routière, utilisez la fonction SOS depuis l\'onglet Ride :');
  numbered(doc, ['Touchez le bouton "Lancer SOS"', 'Définissez votre rayon de recherche (10-100 km)', 'Confirmez l\'envoi — tous les bikers dans le rayon recevront une notification', 'Ceux qui sont disponibles pourront répondre et venir à votre aide']);
  doc.moveDown(0.3);
  body(doc, 'Le SOS montre votre position exacte sur la carte pour que les secouristes puissent vous trouver facilement.');

  sectionTitle(doc, '5. Propositions');
  body(doc, 'Les propositions vous permettent d\'organiser des sorties et de trouver des compagnons de route :\nTypes de proposition :');
  bullet(doc, ['FindAFriend — Vous cherchez d\'autres bikers pour une balade en groupe', 'Chercher Passagère — Vous avez le siège libre et cherchez un passager', 'Hitcher — Vous offrez un trajet à quelqu\'un', 'HitchHiker — Vous cherchez un trajet']);
  doc.moveDown(0.3);
  body(doc, 'Pour créer une proposition : touchez le bouton "+" dans l\'onglet Propositions, choisissez le type, entrez titre, description, lieu de départ et horaire. Les autres utilisateurs pourront participer ou vous contacter.');

  sectionTitle(doc, '6. Garage Match');
  body(doc, 'Garage Match est un système automatique qui associe bikers et passagers selon la compatibilité des motos :');
  numbered(doc, ['Ajoutez vos motos dans le Garage (onglet Profil → Garage)', 'Si vous êtes passager/ère, indiquez vos préférences de moto dans la Wishlist', 'Le système recherche automatiquement des correspondances compatibles', 'Lors d\'un match, vous recevez une notification', 'Vous pouvez accepter ou refuser le match', 'Si les deux acceptent, un chat privé s\'ouvre']);
  doc.moveDown(0.3);
  body(doc, 'Le match tient compte de : marque, modèle, type de moto et style de conduite.');

  sectionTitle(doc, '7. Chat Privé');
  body(doc, 'Le chat privé vous permet de communiquer avec les autres utilisateurs :');
  bullet(doc, ['Vous pouvez envoyer des messages texte', 'Les conversations ne sont visibles que par les participants', 'Accédez au chat depuis : le profil d\'un utilisateur, un match accepté, ou l\'onglet Chat']);
  doc.moveDown(0.3);
  body(doc, 'Les messages sont livrés en temps réel. Vous pouvez aussi partager votre position pour faciliter les rencontres.');

  sectionTitle(doc, '8. MotoClub');
  body(doc, 'Les MotoClubs sont des groupes pour motocyclistes de la même marque ou zone :');
  bullet(doc, ['Recherchez votre MotoClub dans l\'onglet dédié', 'Demandez l\'adhésion — l\'approbation peut être automatique ou manuelle', 'Une fois inscrit, accédez au chat de groupe du club', 'Utilisez les hashtags (#) pour filtrer les messages par sujet', 'Chaque club affiche le nombre de membres et les informations de la marque']);
  doc.moveDown(0.3);
  body(doc, 'Vous pouvez faire partie de plusieurs MotoClubs simultanément.');

  sectionTitle(doc, '9. Concours Photo');
  body(doc, 'Chaque semaine, il y a un concours photo thématique :');
  numbered(doc, ['Téléchargez votre meilleure photo depuis le bouton dans l\'onglet Contest', 'Votez pour les photos des autres utilisateurs (votes limités par jour)', 'À la fin de la semaine, la photo avec le plus de votes gagne', 'Les gagnants sont affichés dans le Hall des Gagnants']);
  doc.moveDown(0.3);
  body(doc, 'Les photos doivent être appropriées et respecter les directives de la communauté.');

  sectionTitle(doc, '10. Suivi GPS');
  body(doc, 'La fonction Tracking enregistre vos parcours à moto :');
  numbered(doc, ['Depuis l\'onglet Ride, appuyez sur "Démarrer le suivi"', 'L\'app enregistre : distance, vitesse, altitude et durée', 'Vous pouvez ajuster la fréquence GPS pour économiser la batterie', 'Appuyez sur "Arrêter le suivi" pour terminer l\'enregistrement', 'Les parcours sont sauvegardés dans votre historique']);
  doc.moveDown(0.3);
  body(doc, 'Les données de suivi contribuent à vos statistiques de profil (km totaux, trajets effectués).');

  sectionTitle(doc, '11. Easter Eggs');
  body(doc, 'Dispersés à travers l\'Europe, il y a des Easter Eggs virtuels à collecter :');
  bullet(doc, ['Quand vous êtes près d\'un Easter Egg, vous recevez une notification', 'Touchez "Collecter !" pour l\'ajouter à votre collection', 'Chaque Easter Egg vaut des points', 'Vérifiez le compteur dans votre profil pour voir combien vous en avez trouvé']);
  doc.moveDown(0.3);
  body(doc, 'C\'est une façon amusante d\'explorer de nouvelles zones lors de vos balades !');

  sectionTitle(doc, '12. Paramètres et Langue');
  body(doc, 'Dans votre profil, vous pouvez personnaliser l\'application :');
  bullet(doc, ['Langue — Choisissez entre Italiano, English, Deutsch, Español et Français', 'Modifier le profil — Mettez à jour la bio, les photos, le numéro de téléphone', 'Garage — Gérez vos motos', 'Préférences de recherche — Choisissez de voir uniquement les bikers, les passagers ou les deux']);
  doc.moveDown(0.3);
  body(doc, 'Changez la langue depuis le sélecteur dans votre profil. Tous les écrans se mettent à jour immédiatement.');

  sectionTitle(doc, '13. Sécurité et Confidentialité');
  body(doc, 'BikerLink prend votre sécurité au sérieux :');
  bullet(doc, ['Votre position n\'est visible que lorsque vous êtes "disponible"', 'Vous pouvez signaler les utilisateurs inappropriés (Profil utilisateur → Signaler)', 'Les photos sont modérées avant publication', 'Vous pouvez supprimer votre compte à tout moment (Profil → Supprimer le compte)', 'La suppression est définitive après 30 jours — vous pouvez l\'annuler en vous connectant', 'Vos données sont protégées conformément au règlement européen RGPD']);
  doc.moveDown(0.3);
  body(doc, 'Pour tout problème, utilisez la section Feedback dans votre profil.');

  // Footer page
  doc.addPage();
  doc.moveDown(8);
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1a2e').text('BikerLink', { align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(12).fillColor('#555').text("U'll never ride alone", { align: 'center' });
  doc.moveDown(1);
  doc.font('Helvetica').fontSize(10).fillColor('#777').text('bikerlinkapp@gmail.com', { align: 'center' });
  doc.text('© 2026 BikerLink — Tutti i diritti riservati', { align: 'center' });

  doc.end();
  console.log('Manual PDF generated');
}

// ============================================================
// EULA
// ============================================================
function generateEula() {
  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(fs.createWriteStream(path.join(OUT_DIR, 'bikerlink-eula.pdf')));
  addFooter(doc);

  // Cover
  addHeader(doc, 'End User License Agreement (EULA)', 'IT | EN | DE | ES | FR — Versione 1.0 — Marzo 2026');

  function eulaSection(num, title, content) {
    sectionTitle(doc, `${num}. ${title}`);
    body(doc, content);
    doc.moveDown(0.5);
  }

  // ITALIAN
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('TERMINI E CONDIZIONI D\'USO — ITALIANO', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACCETTAZIONE DEI TERMINI', 'Utilizzando l\'app BikerLink, l\'utente accetta integralmente i presenti Termini e Condizioni d\'Uso.\nSe non si accettano questi termini, non è possibile utilizzare l\'applicazione.\nL\'uso continuato dell\'app dopo eventuali modifiche ai presenti termini costituisce accettazione delle modifiche stesse.');
  eulaSection(2, 'LICENZA D\'USO', 'BikerLink concede all\'utente una licenza limitata, non esclusiva, non trasferibile e revocabile per l\'uso personale dell\'applicazione.\nÈ vietato: copiare, modificare, distribuire, vendere o concedere in sublicenza l\'applicazione o qualsiasi sua parte.\nÈ vietato effettuare il reverse engineering, decompilare o disassemblare l\'applicazione.\nÈ vietato utilizzare l\'applicazione per scopi commerciali non autorizzati.');
  eulaSection(3, 'LIMITAZIONI E RESTRIZIONI', 'L\'utente si impegna a non utilizzare l\'applicazione per:\n- Scopi illeciti o in violazione di leggi applicabili\n- Molestie, diffamazione o comportamenti offensivi verso altri utenti\n- Invio di contenuti spam, malware o materiale inappropriato\n- Raccolta non autorizzata di dati di altri utenti\n- Interferenza con il corretto funzionamento del servizio\n- Creazione di account falsi o impersonazione di terzi\nL\'utente deve avere almeno 18 anni per utilizzare il servizio.');
  eulaSection(4, 'PROPRIETÀ INTELLETTUALE', 'L\'applicazione BikerLink, inclusi tutti i contenuti, il codice sorgente, i loghi, i marchi e i design, è di proprietà esclusiva di BikerLink e protetta dalle leggi sul diritto d\'autore.\nI contenuti generati dagli utenti rimangono di proprietà degli utenti stessi, che concedono a BikerLink una licenza non esclusiva per utilizzarli ai fini del servizio.\nIl marchio BikerLink non può essere utilizzato senza previa autorizzazione scritta.');
  eulaSection(5, 'PRIVACY E DATI PERSONALI', 'Il trattamento dei dati personali avviene in conformità al Regolamento Generale sulla Protezione dei Dati (GDPR) UE 2016/679.\nI dati raccolti vengono utilizzati esclusivamente per fornire e migliorare il servizio.\nLa posizione GPS viene condivisa solo quando l\'utente è impostato come \'disponibile\'.\nLe foto caricate sono soggette a moderazione prima della pubblicazione.\nPer ulteriori dettagli, si rimanda alla Privacy Policy allegata.');
  eulaSection(6, 'RESPONSABILITÀ E ESCLUSIONI', 'BikerLink non è responsabile per danni diretti, indiretti, incidentali o consequenziali derivanti dall\'uso dell\'applicazione.\nBikerLink non è responsabile per incidenti, infortuni o danni che si verifichino durante gli incontri tra utenti organizzati tramite l\'app.\nOgni utente è responsabile della propria sicurezza personale e deve rispettare le norme del Codice della Strada.\nL\'uso di casco omologato e adeguati dispositivi di protezione individuale è obbligatorio.\nBikerLink non garantisce la disponibilità ininterrotta del servizio.');
  eulaSection(7, 'RESCISSIONE', 'BikerLink si riserva il diritto di sospendere o terminare l\'accesso al servizio in caso di violazione dei presenti termini.\nL\'utente può richiedere la cancellazione del proprio account in qualsiasi momento dalla sezione Profilo.\nLa cancellazione dell\'account diventa definitiva dopo 30 giorni dalla richiesta.');
  eulaSection(8, 'LEGGE APPLICABILE E FORO COMPETENTE', 'I presenti Termini e Condizioni sono regolati dalla legge italiana.\nPer qualsiasi controversia derivante dall\'uso dell\'applicazione, le parti eleggono come foro competente il Tribunale di Milano.\nBikerLink si riserva il diritto di modificare i presenti termini in qualsiasi momento, con notifica agli utenti tramite l\'applicazione.');
  eulaSection(9, 'CONTATTI', 'Per domande, segnalazioni o richieste relative ai presenti termini:\nEmail: support@bikerlink.app\nSito web: www.bikerlink.it');

  // ENGLISH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('TERMS AND CONDITIONS OF USE — ENGLISH', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACCEPTANCE OF TERMS', 'By using the BikerLink app, you fully accept these Terms and Conditions of Use.\nIf you do not accept these terms, you may not use the application.\nContinued use of the app following any modifications to these terms constitutes acceptance of those changes.');
  eulaSection(2, 'LICENSE OF USE', 'BikerLink grants you a limited, non-exclusive, non-transferable and revocable license for personal use of the application.\nYou may not: copy, modify, distribute, sell or sublicense the application or any part thereof.\nYou may not perform reverse engineering, decompile or disassemble the application.\nYou may not use the application for unauthorized commercial purposes.');
  eulaSection(3, 'LIMITATIONS AND RESTRICTIONS', 'You agree not to use the application for:\n- Unlawful purposes or in violation of applicable laws\n- Harassment, defamation or offensive behavior towards other users\n- Sending spam, malware or inappropriate material\n- Unauthorized collection of other users\' data\n- Interference with the proper functioning of the service\n- Creating fake accounts or impersonating third parties\nYou must be at least 18 years old to use the service.');
  eulaSection(4, 'INTELLECTUAL PROPERTY', 'The BikerLink application, including all content, source code, logos, trademarks and designs, is the exclusive property of BikerLink and is protected by copyright and intellectual property laws.\nUser-generated content remains the property of users, who grant BikerLink a non-exclusive license to use it for the purposes of the service.\nThe BikerLink trademark may not be used without prior written authorization.');
  eulaSection(5, 'PRIVACY AND PERSONAL DATA', 'The processing of personal data is carried out in accordance with the General Data Protection Regulation (GDPR) EU 2016/679.\nData collected is used exclusively to provide and improve the service.\nGPS location is shared only when the user is set as \'available\'.\nUploaded photos are subject to moderation before publication.\nFor further details, please refer to the attached Privacy Policy.');
  eulaSection(6, 'LIABILITY AND EXCLUSIONS', 'BikerLink is not liable for any direct, indirect, incidental or consequential damages arising from the use of the application.\nBikerLink is not responsible for accidents, injuries or damages occurring during meetings between users organized through the app.\nEach user is responsible for their own personal safety and must comply with the Highway Code.\nThe use of an approved helmet and appropriate personal protective equipment is mandatory.\nBikerLink does not guarantee uninterrupted availability of the service.');
  eulaSection(7, 'TERMINATION', 'BikerLink reserves the right to suspend or terminate access to the service in case of violation of these terms.\nUsers may request deletion of their account at any time from the Profile section.\nAccount deletion becomes permanent after 30 days from the request.');
  eulaSection(8, 'APPLICABLE LAW AND JURISDICTION', 'These Terms and Conditions are governed by Italian law.\nFor any dispute arising from the use of the application, the parties elect the Court of Milan as the competent jurisdiction.\nBikerLink reserves the right to modify these terms at any time, with notification to users via the application.');
  eulaSection(9, 'CONTACT', 'For questions, reports or requests relating to these terms:\nEmail: support@bikerlink.app\nWebsite: www.bikerlink.it');

  // GERMAN
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('NUTZUNGSBEDINGUNGEN — DEUTSCH', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ANNAHME DER BEDINGUNGEN', 'Durch die Nutzung der BikerLink-App akzeptierst du diese Nutzungsbedingungen vollständig.\nWenn du diese Bedingungen nicht akzeptierst, darfst du die Anwendung nicht nutzen.\nDie fortgesetzte Nutzung der App nach Änderungen der Bedingungen gilt als Akzeptanz der Änderungen.');
  eulaSection(2, 'NUTZUNGSLIZENZ', 'BikerLink gewährt dir eine eingeschränkte, nicht-exklusive, nicht übertragbare und widerrufliche Lizenz zur persönlichen Nutzung der Anwendung.\nDu darfst nicht: die Anwendung oder Teile davon kopieren, modifizieren, verteilen, verkaufen oder unterlizenzieren.\nDu darfst kein Reverse Engineering, Dekompilierung oder Disassemblierung der Anwendung durchführen.\nDu darfst die Anwendung nicht für nicht autorisierte kommerzielle Zwecke nutzen.');
  eulaSection(3, 'EINSCHRÄNKUNGEN', 'Du verpflichtest dich, die Anwendung nicht zu nutzen für:\n- Rechtswidrige Zwecke oder Verstöße gegen geltende Gesetze\n- Belästigung, Verleumdung oder beleidigendes Verhalten gegenüber anderen Nutzern\n- Versenden von Spam, Malware oder unangemessenem Material\n- Unerlaubte Sammlung von Daten anderer Nutzer\n- Störung des ordnungsgemäßen Betriebs des Dienstes\n- Erstellung falscher Konten oder Imitation Dritter\nDu musst mindestens 18 Jahre alt sein, um den Dienst zu nutzen.');
  eulaSection(4, 'GEISTIGES EIGENTUM', 'Die BikerLink-Anwendung ist ausschließliches Eigentum von BikerLink und durch Urheberrechtsgesetze geschützt.\nVon Nutzern erstellte Inhalte bleiben Eigentum der Nutzer, die BikerLink eine nicht-exklusive Lizenz zur Nutzung für Zwecke des Dienstes gewähren.\nDie Marke BikerLink darf ohne vorherige schriftliche Genehmigung nicht verwendet werden.');
  eulaSection(5, 'DATENSCHUTZ UND PERSONENBEZOGENE DATEN', 'Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutz-Grundverordnung (DSGVO) EU 2016/679.\nGesammelte Daten werden ausschließlich zur Bereitstellung und Verbesserung des Dienstes verwendet.\nDer GPS-Standort wird nur geteilt, wenn der Nutzer auf \'verfügbar\' eingestellt ist.\nHochgeladene Fotos unterliegen der Moderation vor der Veröffentlichung.');
  eulaSection(6, 'HAFTUNG UND AUSSCHLÜSSE', 'BikerLink haftet nicht für direkte, indirekte, zufällige oder Folgeschäden aus der Nutzung der Anwendung.\nBikerLink ist nicht verantwortlich für Unfälle, Verletzungen oder Schäden bei Treffen zwischen über die App organisierten Nutzern.\nJeder Nutzer ist für seine persönliche Sicherheit verantwortlich und muss die Straßenverkehrsordnung einhalten.\nDas Tragen eines zugelassenen Helms und geeigneter Schutzausrüstung ist obligatorisch.');
  eulaSection(7, 'KÜNDIGUNG', 'BikerLink behält sich das Recht vor, den Zugang zum Dienst im Falle eines Verstoßes gegen diese Bedingungen zu sperren.\nNutzer können die Löschung ihres Kontos jederzeit im Profilbereich beantragen.\nDie Kontolöschung wird nach 30 Tagen ab Antrag endgültig.');
  eulaSection(8, 'ANWENDBARES RECHT UND GERICHTSSTAND', 'Diese Nutzungsbedingungen unterliegen italienischem Recht.\nFür alle Streitigkeiten aus der Nutzung wählen die Parteien das Gericht Mailand als zuständiges Gericht.\nBikerLink behält sich das Recht vor, diese Bedingungen jederzeit mit Benachrichtigung der Nutzer zu ändern.');
  eulaSection(9, 'KONTAKT', 'Für Fragen, Meldungen oder Anfragen zu diesen Bedingungen:\nE-Mail: support@bikerlink.app\nWebseite: www.bikerlink.it');

  // SPANISH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('TÉRMINOS Y CONDICIONES DE USO — ESPAÑOL', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACEPTACIÓN DE LOS TÉRMINOS', 'Al usar la app BikerLink, el usuario acepta íntegramente los presentes Términos y Condiciones de Uso.\nSi no aceptas estos términos, no puedes utilizar la aplicación.\nEl uso continuado de la app tras modificaciones a estos términos constituye aceptación de dichas modificaciones.');
  eulaSection(2, 'LICENCIA DE USO', 'BikerLink concede al usuario una licencia limitada, no exclusiva, no transferible y revocable para el uso personal de la aplicación.\nEstá prohibido: copiar, modificar, distribuir, vender o sublicenciar la aplicación o cualquier parte de la misma.\nEstá prohibido realizar ingeniería inversa, descompilar o desensamblar la aplicación.\nEstá prohibido utilizar la aplicación para fines comerciales no autorizados.');
  eulaSection(3, 'LIMITACIONES Y RESTRICCIONES', 'El usuario se compromete a no utilizar la aplicación para:\n- Fines ilícitos o en violación de las leyes aplicables\n- Acoso, difamación o comportamiento ofensivo hacia otros usuarios\n- Envío de spam, malware o material inapropiado\n- Recopilación no autorizada de datos de otros usuarios\n- Interferencia con el correcto funcionamiento del servicio\n- Creación de cuentas falsas o suplantación de identidad de terceros\nEl usuario debe tener al menos 18 años para utilizar el servicio.');
  eulaSection(4, 'PROPIEDAD INTELECTUAL', 'La aplicación BikerLink es propiedad exclusiva de BikerLink y está protegida por las leyes de derechos de autor y propiedad intelectual.\nLos contenidos generados por los usuarios siguen siendo propiedad de los propios usuarios.\nLa marca BikerLink no puede utilizarse sin autorización previa por escrito.');
  eulaSection(5, 'PRIVACIDAD Y DATOS PERSONALES', 'El tratamiento de datos personales se lleva a cabo de conformidad con el Reglamento General de Protección de Datos (RGPD) UE 2016/679.\nLos datos recopilados se utilizan exclusivamente para proporcionar y mejorar el servicio.\nLa ubicación GPS se comparte únicamente cuando el usuario está configurado como \'disponible\'.\nLas fotos cargadas están sujetas a moderación antes de su publicación.');
  eulaSection(6, 'RESPONSABILIDAD Y EXCLUSIONES', 'BikerLink no es responsable de daños directos, indirectos, incidentales o consecuentes derivados del uso de la aplicación.\nBikerLink no es responsable de accidentes, lesiones o daños que ocurran durante los encuentros entre usuarios organizados a través de la app.\nCada usuario es responsable de su propia seguridad personal y debe respetar el Código de Circulación.\nEl uso de casco homologado y equipos de protección personal adecuados es obligatorio.');
  eulaSection(7, 'RESCISIÓN', 'BikerLink se reserva el derecho de suspender o terminar el acceso al servicio en caso de violación de estos términos.\nLos usuarios pueden solicitar la eliminación de su cuenta en cualquier momento desde la sección Perfil.\nLa eliminación de la cuenta se vuelve definitiva después de 30 días desde la solicitud.');
  eulaSection(8, 'LEY APLICABLE Y JURISDICCIÓN', 'Los presentes Términos y Condiciones se rigen por la ley italiana.\nPara cualquier disputa derivada del uso de la aplicación, las partes eligen el Tribunal de Milán como jurisdicción competente.\nBikerLink se reserva el derecho de modificar estos términos en cualquier momento.');
  eulaSection(9, 'CONTACTO', 'Para preguntas, notificaciones o solicitudes relacionadas con estos términos:\nEmail: support@bikerlink.app\nSitio web: www.bikerlink.it');

  // FRENCH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('CONDITIONS GÉNÉRALES D\'UTILISATION — FRANÇAIS', { align: 'center' });
  doc.moveDown(0.8);

  eulaSection(1, 'ACCEPTATION DES CONDITIONS', 'En utilisant l\'app BikerLink, l\'utilisateur accepte intégralement les présentes Conditions Générales d\'Utilisation.\nSi vous n\'acceptez pas ces conditions, vous ne pouvez pas utiliser l\'application.\nL\'utilisation continue de l\'app après toute modification des conditions constitue une acceptation de ces modifications.');
  eulaSection(2, 'LICENCE D\'UTILISATION', 'BikerLink vous accorde une licence limitée, non exclusive, non transférable et révocable pour l\'utilisation personnelle de l\'application.\nIl est interdit de : copier, modifier, distribuer, vendre ou sous-licencier l\'application ou toute partie de celle-ci.\nIl est interdit de procéder à l\'ingénierie inverse, décompiler ou désassembler l\'application.\nIl est interdit d\'utiliser l\'application à des fins commerciales non autorisées.');
  eulaSection(3, 'LIMITATIONS ET RESTRICTIONS', 'Vous vous engagez à ne pas utiliser l\'application pour :\n- Des fins illicites ou en violation des lois applicables\n- Harcèlement, diffamation ou comportement offensant envers d\'autres utilisateurs\n- L\'envoi de spam, logiciels malveillants ou matériel inapproprié\n- La collecte non autorisée de données d\'autres utilisateurs\n- Interférence avec le bon fonctionnement du service\n- La création de faux comptes ou l\'usurpation d\'identité de tiers\nVous devez avoir au moins 18 ans pour utiliser le service.');
  eulaSection(4, 'PROPRIÉTÉ INTELLECTUELLE', 'L\'application BikerLink est la propriété exclusive de BikerLink et est protégée par les lois sur le droit d\'auteur et la propriété intellectuelle.\nLes contenus générés par les utilisateurs restent la propriété des utilisateurs.\nLa marque BikerLink ne peut être utilisée sans autorisation écrite préalable.');
  eulaSection(5, 'CONFIDENTIALITÉ ET DONNÉES PERSONNELLES', 'Le traitement des données personnelles est effectué conformément au Règlement Général sur la Protection des Données (RGPD) UE 2016/679.\nLes données collectées sont utilisées exclusivement pour fournir et améliorer le service.\nLa localisation GPS est partagée uniquement lorsque l\'utilisateur est configuré comme \'disponible\'.\nLes photos téléchargées sont soumises à modération avant publication.');
  eulaSection(6, 'RESPONSABILITÉ ET EXCLUSIONS', 'BikerLink n\'est pas responsable des dommages directs, indirects, accessoires ou consécutifs découlant de l\'utilisation de l\'application.\nBikerLink n\'est pas responsable des accidents, blessures ou dommages survenant lors de rencontres entre utilisateurs organisés via l\'app.\nChaque utilisateur est responsable de sa propre sécurité personnelle et doit respecter le Code de la Route.\nLe port d\'un casque homologué et d\'équipements de protection individuelle appropriés est obligatoire.');
  eulaSection(7, 'RÉSILIATION', 'BikerLink se réserve le droit de suspendre ou de mettre fin à l\'accès au service en cas de violation des présentes conditions.\nLes utilisateurs peuvent demander la suppression de leur compte à tout moment depuis la section Profil.\nLa suppression du compte devient définitive après 30 jours à compter de la demande.');
  eulaSection(8, 'LOI APPLICABLE ET JURIDICTION COMPÉTENTE', 'Les présentes Conditions Générales sont régies par le droit italien.\nPour tout litige découlant de l\'utilisation de l\'application, les parties choisissent le Tribunal de Milan comme juridiction compétente.\nBikerLink se réserve le droit de modifier les présentes conditions à tout moment.');
  eulaSection(9, 'CONTACT', 'Pour toute question, signalement ou demande relative aux présentes conditions :\nEmail : support@bikerlink.app\nSite web : www.bikerlink.it');

  doc.end();
  console.log('EULA PDF generated');
}

// ============================================================
// PRIVACY POLICY
// ============================================================
function generatePrivacyPolicy() {
  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(fs.createWriteStream(path.join(OUT_DIR, 'bikerlink-privacy-policy.pdf')));
  addFooter(doc);

  addHeader(doc, 'Informativa sulla Privacy / Privacy Policy', 'IT | EN | DE | ES | FR — Versione 1.0 — Marzo 2026 — GDPR Conforme');

  function privSection(num, title, content) {
    sectionTitle(doc, `${num}. ${title}`);
    body(doc, content);
    doc.moveDown(0.5);
  }

  // ITALIAN
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('INFORMATIVA SULLA PRIVACY — ITALIANO', { align: 'center' });
  doc.moveDown(0.8);

  privSection(1, 'TITOLARE DEL TRATTAMENTO', 'Il titolare del trattamento dei dati personali è BikerLink, raggiungibile all\'indirizzo email: support@bikerlink.app\nIl titolare è responsabile del trattamento dei dati personali degli utenti dell\'app BikerLink in conformità al GDPR UE 2016/679.');
  privSection(2, 'DATI RACCOLTI', 'Raccogliamo i seguenti dati personali:\n- Dati di registrazione: nickname, email, password (cifrata), anno di nascita, tipo utente, sesso, paese, regione\n- Dati di profilo: foto profilo, biografia, numero di telefono (opzionale), preferenze di ricerca\n- Dati di localizzazione: posizione GPS (solo quando l\'utente è impostato come \'disponibile\')\n- Contenuti caricati: foto del garage, foto dei contest, foto profilo\n- Dati tecnici: indirizzo IP, tipo di dispositivo, versione app, log di accesso\n- Dati di utilizzo: interazioni con altri utenti, messaggi (solo metadati), partecipazione a contest\n- Dati veicoli: informazioni sui motocicli aggiunti al Garage');
  privSection(3, 'FINALITÀ DEL TRATTAMENTO', 'I dati vengono trattati per le seguenti finalità:\n- Fornitura del servizio: registrazione, autenticazione, funzionamento dell\'app\n- Matching tra utenti: connettere biker e passeggeri compatibili\n- Comunicazioni: notifiche push, email di verifica, messaggi di sistema\n- Sicurezza: prevenzione frodi, moderazione contenuti, gestione segnalazioni\n- Miglioramento del servizio: analisi dell\'utilizzo, debug, ottimizzazione\n- Adempimenti legali: obblighi normativi e richieste delle autorità competenti');
  privSection(4, 'BASE GIURIDICA', 'Il trattamento dei dati si basa sulle seguenti basi giuridiche:\n- Esecuzione del contratto (Art. 6(1)(b) GDPR): dati necessari per fornire il servizio\n- Consenso (Art. 6(1)(a) GDPR): per dati facoltativi e comunicazioni marketing\n- Legittimo interesse (Art. 6(1)(f) GDPR): per sicurezza, prevenzione frodi e miglioramento del servizio\n- Obbligo legale (Art. 6(1)(c) GDPR): per adempimenti normativi');
  privSection(5, 'CONSERVAZIONE DEI DATI', 'I dati vengono conservati per i seguenti periodi:\n- Dati account attivo: per tutta la durata dell\'iscrizione\n- Dopo cancellazione account: 30 giorni (periodo di ripristino), poi cancellazione definitiva\n- Log di sicurezza: 12 mesi\n- Dati di backup: massimo 90 giorni\n- Dati richiesti per obblighi legali: secondo i termini di legge applicabili');
  privSection(6, 'DIRITTI DELL\'UTENTE', 'In base al GDPR, l\'utente ha i seguenti diritti:\n- Diritto di accesso: ottenere copia dei propri dati personali\n- Diritto di rettifica: correggere dati inesatti o incompleti\n- Diritto alla cancellazione (\'diritto all\'oblio\'): richiedere la cancellazione dei propri dati\n- Diritto di limitazione: limitare il trattamento in determinate circostanze\n- Diritto alla portabilità: ricevere i dati in formato strutturato e leggibile\n- Diritto di opposizione: opporsi al trattamento basato su legittimo interesse\n- Diritto di reclamo: presentare reclamo all\'Autorità Garante per la Protezione dei Dati Personali\nPer esercitare tali diritti, contattare: support@bikerlink.app');
  privSection(7, 'COOKIE E TECNOLOGIE SIMILI', 'L\'app utilizza cookie tecnici essenziali per il funzionamento del servizio (sessione, autenticazione).\nNon utilizziamo cookie di profilazione o di terze parti per scopi pubblicitari.\nI cookie tecnici non richiedono consenso in quanto necessari per il funzionamento del servizio.');
  privSection(8, 'TRASFERIMENTI INTERNAZIONALI', 'I dati sono conservati su server situati nell\'Unione Europea.\nEventuali trasferimenti verso paesi terzi avvengono nel rispetto delle garanzie previste dal GDPR.');
  privSection(9, 'CONTATTI E RECLAMI', 'Per qualsiasi richiesta relativa alla privacy: support@bikerlink.app\nSito web: www.bikerlink.it\nAutorità di controllo: Garante per la protezione dei dati personali — www.garanteprivacy.it');

  // ENGLISH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('PRIVACY POLICY — ENGLISH', { align: 'center' });
  doc.moveDown(0.8);

  privSection(1, 'DATA CONTROLLER', 'The data controller for personal data is BikerLink, reachable at: support@bikerlink.app\nThe controller is responsible for processing personal data of BikerLink app users in accordance with GDPR EU 2016/679.');
  privSection(2, 'DATA COLLECTED', 'We collect the following personal data:\n- Registration data: nickname, email, password (encrypted), birth year, user type, gender, country, region\n- Profile data: profile photo, biography, phone number (optional), search preferences\n- Location data: GPS position (only when the user is set as \'available\')\n- Uploaded content: garage photos, contest photos, profile photos\n- Technical data: IP address, device type, app version, access logs\n- Usage data: interactions with other users, messages (metadata only), contest participation\n- Vehicle data: information about motorcycles added to the Garage');
  privSection(3, 'PURPOSE OF PROCESSING', 'Data is processed for the following purposes:\n- Service provision: registration, authentication, app operation\n- User matching: connecting compatible bikers and passengers\n- Communications: push notifications, verification emails, system messages\n- Security: fraud prevention, content moderation, report management\n- Service improvement: usage analysis, debugging, optimization\n- Legal compliance: regulatory obligations and requests from competent authorities');
  privSection(4, 'LEGAL BASIS', 'Data processing is based on the following legal grounds:\n- Contract performance (Art. 6(1)(b) GDPR): data necessary to provide the service\n- Consent (Art. 6(1)(a) GDPR): for optional data and marketing communications\n- Legitimate interest (Art. 6(1)(f) GDPR): for security, fraud prevention and service improvement\n- Legal obligation (Art. 6(1)(c) GDPR): for regulatory compliance');
  privSection(5, 'DATA RETENTION', 'Data is retained for the following periods:\n- Active account data: for the duration of the subscription\n- After account deletion: 30 days (recovery period), then permanent deletion\n- Security logs: 12 months\n- Backup data: maximum 90 days\n- Data required for legal obligations: according to applicable legal terms');
  privSection(6, 'USER RIGHTS', 'Under the GDPR, users have the following rights:\n- Right of access: obtain a copy of your personal data\n- Right of rectification: correct inaccurate or incomplete data\n- Right to erasure (\'right to be forgotten\'): request deletion of your data\n- Right to restriction: limit processing in certain circumstances\n- Right to data portability: receive data in structured, machine-readable format\n- Right to object: object to processing based on legitimate interest\n- Right to lodge a complaint: with the relevant data protection authority\nTo exercise these rights, contact: support@bikerlink.app');
  privSection(7, 'COOKIES AND SIMILAR TECHNOLOGIES', 'The app uses essential technical cookies for service operation (session, authentication).\nWe do not use profiling or third-party cookies for advertising purposes.\nTechnical cookies do not require consent as they are necessary for the service to function.');
  privSection(8, 'INTERNATIONAL TRANSFERS', 'Data is stored on servers located in the European Union.\nAny transfers to third countries are carried out in compliance with GDPR guarantees.');
  privSection(9, 'CONTACTS AND COMPLAINTS', 'For any privacy-related request: support@bikerlink.app\nWebsite: www.bikerlink.it\nSupervisory authority: Your national Data Protection Authority');

  // GERMAN
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('DATENSCHUTZERKLÄRUNG — DEUTSCH', { align: 'center' });
  doc.moveDown(0.8);

  privSection(1, 'VERANTWORTLICHER', 'Der Verantwortliche für die Verarbeitung personenbezogener Daten ist BikerLink, erreichbar unter: support@bikerlink.app\nDer Verantwortliche ist für die Verarbeitung personenbezogener Daten der BikerLink-App-Nutzer gemäß DSGVO EU 2016/679 zuständig.');
  privSection(2, 'ERHOBENE DATEN', 'Wir erheben folgende personenbezogene Daten:\n- Registrierungsdaten: Nickname, E-Mail, Passwort (verschlüsselt), Geburtsjahr, Benutzertyp, Geschlecht, Land, Region\n- Profildaten: Profilfoto, Biografie, Telefonnummer (optional), Sucheinstellungen\n- Standortdaten: GPS-Position (nur wenn der Nutzer als \'verfügbar\' eingestellt ist)\n- Hochgeladene Inhalte: Garage-Fotos, Contest-Fotos, Profilfotos\n- Technische Daten: IP-Adresse, Gerätetyp, App-Version, Zugriffsprotokolle\n- Nutzungsdaten: Interaktionen mit anderen Nutzern, Nachrichten (nur Metadaten), Contest-Teilnahme\n- Fahrzeugdaten: Informationen zu in der Garage hinzugefügten Motorrädern');
  privSection(3, 'ZWECKE DER VERARBEITUNG', 'Daten werden für folgende Zwecke verarbeitet:\n- Diensterbringung: Registrierung, Authentifizierung, App-Betrieb\n- Nutzer-Matching: Verbindung kompatibler Biker und Mitfahrer\n- Kommunikation: Push-Benachrichtigungen, Bestätigungs-E-Mails, Systemnachrichten\n- Sicherheit: Betrugsprävention, Inhaltsmoderation, Meldungsverwaltung\n- Serviceverbesserung: Nutzungsanalyse, Debugging, Optimierung\n- Rechtliche Compliance: Regulatorische Verpflichtungen und Anfragen zuständiger Behörden');
  privSection(4, 'RECHTSGRUNDLAGE', 'Die Datenverarbeitung basiert auf folgenden Rechtsgrundlagen:\n- Vertragserfüllung (Art. 6(1)(b) DSGVO): für die Diensterbringung notwendige Daten\n- Einwilligung (Art. 6(1)(a) DSGVO): für optionale Daten und Marketing-Kommunikation\n- Berechtigte Interessen (Art. 6(1)(f) DSGVO): für Sicherheit, Betrugsprävention und Serviceverbesserung\n- Rechtliche Verpflichtung (Art. 6(1)(c) DSGVO): für regulatorische Compliance');
  privSection(5, 'DATENSPEICHERUNG', 'Daten werden für folgende Zeiträume gespeichert:\n- Aktive Kontodaten: für die Dauer des Abonnements\n- Nach Kontolöschung: 30 Tage (Wiederherstellungszeitraum), dann endgültige Löschung\n- Sicherheitsprotokolle: 12 Monate\n- Backup-Daten: maximal 90 Tage');
  privSection(6, 'NUTZERRECHTE', 'Gemäß DSGVO haben Nutzer folgende Rechte:\n- Auskunftsrecht: Kopie der eigenen personenbezogenen Daten erhalten\n- Berichtigungsrecht: Unrichtige oder unvollständige Daten korrigieren\n- Recht auf Löschung (\'Recht auf Vergessenwerden\'): Löschung der eigenen Daten beantragen\n- Recht auf Einschränkung: Verarbeitung in bestimmten Umständen einschränken\n- Recht auf Datenübertragbarkeit: Daten in strukturiertem, maschinenlesbarem Format erhalten\n- Widerspruchsrecht: Verarbeitung auf Basis berechtigter Interessen widersprechen\n- Beschwerderecht: Beschwerde bei der zuständigen Datenschutzbehörde einreichen\nZur Ausübung dieser Rechte wenden Sie sich an: support@bikerlink.app');
  privSection(7, 'COOKIES UND ÄHNLICHE TECHNOLOGIEN', 'Die App verwendet technisch notwendige Cookies für den Betrieb des Dienstes (Sitzung, Authentifizierung).\nWir verwenden keine Profiling- oder Drittanbieter-Cookies zu Werbezwecken.');
  privSection(8, 'INTERNATIONALE ÜBERMITTLUNGEN', 'Daten werden auf Servern innerhalb der Europäischen Union gespeichert.\nEtwaige Übermittlungen in Drittländer erfolgen unter Einhaltung der DSGVO-Garantien.');
  privSection(9, 'KONTAKT UND BESCHWERDEN', 'Für datenschutzbezogene Anfragen: support@bikerlink.app\nWebseite: www.bikerlink.it');

  // SPANISH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('POLÍTICA DE PRIVACIDAD — ESPAÑOL', { align: 'center' });
  doc.moveDown(0.8);

  privSection(1, 'RESPONSABLE DEL TRATAMIENTO', 'El responsable del tratamiento de datos personales es BikerLink, contactable en: support@bikerlink.app\nEl responsable es responsable del tratamiento de datos personales de los usuarios de la app BikerLink.');
  privSection(2, 'DATOS RECOPILADOS', 'Recopilamos los siguientes datos personales:\n- Datos de registro: nickname, email, contraseña (cifrada), año de nacimiento, tipo de usuario, sexo, país, región\n- Datos de perfil: foto de perfil, biografía, número de teléfono (opcional), preferencias de búsqueda\n- Datos de localización: posición GPS (solo cuando el usuario está configurado como \'disponible\')\n- Contenidos cargados: fotos del garaje, fotos de concursos, fotos de perfil\n- Datos técnicos: dirección IP, tipo de dispositivo, versión de la app, registros de acceso\n- Datos de uso: interacciones con otros usuarios, mensajes (solo metadatos), participación en concursos');
  privSection(3, 'FINALIDADES DEL TRATAMIENTO', 'Los datos se tratan para las siguientes finalidades:\n- Prestación del servicio: registro, autenticación, funcionamiento de la app\n- Matching entre usuarios: conectar bikers y pasajeros compatibles\n- Comunicaciones: notificaciones push, emails de verificación, mensajes del sistema\n- Seguridad: prevención de fraudes, moderación de contenidos, gestión de denuncias\n- Mejora del servicio: análisis de uso, depuración, optimización');
  privSection(4, 'BASE JURÍDICA', 'El tratamiento de datos se basa en las siguientes bases jurídicas:\n- Ejecución del contrato (Art. 6(1)(b) RGPD): datos necesarios para prestar el servicio\n- Consentimiento (Art. 6(1)(a) RGPD): para datos opcionales y comunicaciones de marketing\n- Interés legítimo (Art. 6(1)(f) RGPD): para seguridad, prevención de fraudes y mejora del servicio\n- Obligación legal (Art. 6(1)(c) RGPD): para el cumplimiento normativo');
  privSection(5, 'CONSERVACIÓN DE DATOS', 'Los datos se conservan durante los siguientes períodos:\n- Datos de cuenta activa: durante toda la duración de la suscripción\n- Tras la eliminación de la cuenta: 30 días (período de recuperación), luego eliminación definitiva\n- Registros de seguridad: 12 meses\n- Datos de copia de seguridad: máximo 90 días');
  privSection(6, 'DERECHOS DEL USUARIO', 'En virtud del RGPD, los usuarios tienen los siguientes derechos:\n- Derecho de acceso: obtener una copia de sus datos personales\n- Derecho de rectificación: corregir datos inexactos o incompletos\n- Derecho de supresión (\'derecho al olvido\'): solicitar la eliminación de sus datos\n- Derecho de limitación: limitar el tratamiento en determinadas circunstancias\n- Derecho a la portabilidad: recibir los datos en formato estructurado y legible por máquina\n- Derecho de oposición: oponerse al tratamiento basado en interés legítimo\nPara ejercer estos derechos, contactar: support@bikerlink.app');
  privSection(7, 'COOKIES Y TECNOLOGÍAS SIMILARES', 'La app utiliza cookies técnicas esenciales para el funcionamiento del servicio (sesión, autenticación).\nNo utilizamos cookies de perfilado ni de terceros con fines publicitarios.');
  privSection(8, 'TRANSFERENCIAS INTERNACIONALES', 'Los datos se almacenan en servidores situados en la Unión Europea.\nLas posibles transferencias a terceros países se realizan respetando las garantías previstas en el RGPD.');
  privSection(9, 'CONTACTO Y RECLAMACIONES', 'Para cualquier solicitud relacionada con la privacidad: support@bikerlink.app\nSitio web: www.bikerlink.it');

  // FRENCH
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a2e').text('POLITIQUE DE CONFIDENTIALITÉ — FRANÇAIS', { align: 'center' });
  doc.moveDown(0.8);

  privSection(1, 'RESPONSABLE DU TRAITEMENT', 'Le responsable du traitement des données personnelles est BikerLink, joignable à : support@bikerlink.app\nLe responsable est chargé du traitement des données personnelles des utilisateurs de l\'app BikerLink conformément au RGPD UE 2016/679.');
  privSection(2, 'DONNÉES COLLECTÉES', 'Nous collectons les données personnelles suivantes :\n- Données d\'inscription : pseudo, email, mot de passe (chiffré), année de naissance, type d\'utilisateur, sexe, pays, région\n- Données de profil : photo de profil, biographie, numéro de téléphone (optionnel), préférences de recherche\n- Données de localisation : position GPS (uniquement lorsque l\'utilisateur est configuré comme \'disponible\')\n- Contenus téléchargés : photos du garage, photos de concours, photos de profil\n- Données techniques : adresse IP, type d\'appareil, version de l\'app, journaux d\'accès\n- Données d\'utilisation : interactions avec d\'autres utilisateurs, messages (métadonnées uniquement), participation aux concours');
  privSection(3, 'FINALITÉS DU TRAITEMENT', 'Les données sont traitées aux fins suivantes :\n- Prestation du service : inscription, authentification, fonctionnement de l\'app\n- Mise en relation d\'utilisateurs : connecter des bikers et des passagers compatibles\n- Communications : notifications push, emails de vérification, messages système\n- Sécurité : prévention des fraudes, modération des contenus, gestion des signalements\n- Amélioration du service : analyse d\'utilisation, débogage, optimisation');
  privSection(4, 'BASE JURIDIQUE', 'Le traitement des données repose sur les bases juridiques suivantes :\n- Exécution du contrat (Art. 6(1)(b) RGPD) : données nécessaires à la fourniture du service\n- Consentement (Art. 6(1)(a) RGPD) : pour les données optionnelles et les communications marketing\n- Intérêt légitime (Art. 6(1)(f) RGPD) : pour la sécurité, la prévention des fraudes et l\'amélioration du service\n- Obligation légale (Art. 6(1)(c) RGPD) : pour la conformité réglementaire');
  privSection(5, 'CONSERVATION DES DONNÉES', 'Les données sont conservées pour les durées suivantes :\n- Données de compte actif : pendant toute la durée de l\'abonnement\n- Après suppression du compte : 30 jours (période de récupération), puis suppression définitive\n- Journaux de sécurité : 12 mois\n- Données de sauvegarde : maximum 90 jours');
  privSection(6, 'DROITS DE L\'UTILISATEUR', 'En vertu du RGPD, les utilisateurs disposent des droits suivants :\n- Droit d\'accès : obtenir une copie de vos données personnelles\n- Droit de rectification : corriger des données inexactes ou incomplètes\n- Droit à l\'effacement (\'droit à l\'oubli\') : demander la suppression de vos données\n- Droit à la limitation : limiter le traitement dans certaines circonstances\n- Droit à la portabilité : recevoir les données dans un format structuré et lisible par machine\n- Droit d\'opposition : s\'opposer au traitement basé sur l\'intérêt légitime\n- Droit de réclamation : déposer une plainte auprès de l\'autorité de protection des données compétente\nPour exercer ces droits, contacter : support@bikerlink.app');
  privSection(7, 'COOKIES ET TECHNOLOGIES SIMILAIRES', 'L\'app utilise des cookies techniques essentiels au fonctionnement du service (session, authentification).\nNous n\'utilisons pas de cookies de profilage ou de tiers à des fins publicitaires.');
  privSection(8, 'TRANSFERTS INTERNATIONAUX', 'Les données sont stockées sur des serveurs situés dans l\'Union Européenne.\nLes éventuels transferts vers des pays tiers sont effectués dans le respect des garanties prévues par le RGPD.');
  privSection(9, 'CONTACT ET RÉCLAMATIONS', 'Pour toute demande relative à la confidentialité : support@bikerlink.app\nSite web : www.bikerlink.it');

  doc.end();
  console.log('Privacy Policy PDF generated');
}

generateManual();
generateEula();
generatePrivacyPolicy();
console.log('All PDFs generated successfully in server/public/');
