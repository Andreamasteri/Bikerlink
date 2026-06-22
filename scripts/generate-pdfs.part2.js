const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generateManualPart2(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter) {
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

  const { generateManualPart3 } = require('./generate-pdfs.part3.js');
  generateManualPart3(doc, sectionTitle, body, bullet, numbered, langTitle, addFooter);
}

function generateEulaInternal(OUT_DIR, addFooter, addHeader, sectionTitle, body) {
  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(fs.createWriteStream(path.join(OUT_DIR, 'bikerlink-eula.pdf')));
  addFooter(doc);

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

  const { generateEulaInternalPart2 } = require('./generate-pdfs.part3.js');
  generateEulaInternalPart2(doc, eulaSection);
  doc.end();
}

function generatePrivacyPolicyInternal(OUT_DIR, addFooter, sectionTitle, body) {
  const doc = new PDFDocument({ margin: 60, size: 'A4' });
  doc.pipe(fs.createWriteStream(path.join(OUT_DIR, 'bikerlink-privacy-policy.pdf')));
  addFooter(doc);

  const addHeader = (doc, title, subtitle) => {
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
  };

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

  doc.end();
}

module.exports = {
  generateManualPart2,
  generateEulaInternal,
  generatePrivacyPolicyInternal
};
