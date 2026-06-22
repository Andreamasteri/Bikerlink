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

  const { generateManualPart2 } = require('./generate-pdfs.part2.js');
  generateManualPart2(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter);
}

function generateEula() {
  const { generateEulaInternal } = require('./generate-pdfs.part2.js');
  generateEulaInternal(OUT_DIR, addFooter, addHeader, sectionTitle, body);
}

function generatePrivacyPolicy() {
  const { generatePrivacyPolicyInternal } = require('./generate-pdfs.part2.js');
  generatePrivacyPolicyInternal(OUT_DIR, addFooter, sectionTitle, body);
}

generateManual();
generateEula();
generatePrivacyPolicy();
