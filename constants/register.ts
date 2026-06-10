export const SUPPORT_EMAIL = 'bikerlinkapp@gmail.com';


export const PHONE_PREFIXES = [
  { code: "+39", country: "Italia" },
  { code: "+1", country: "USA/Canada" },
  { code: "+44", country: "Regno Unito" },
  { code: "+49", country: "Germania" },
  { code: "+33", country: "Francia" },
  { code: "+34", country: "Spagna" },
  { code: "+41", country: "Svizzera" },
  { code: "+43", country: "Austria" },
  { code: "+32", country: "Belgio" },
  { code: "+31", country: "Paesi Bassi" },
  { code: "+351", country: "Portogallo" },
  { code: "+48", country: "Polonia" },
  { code: "+46", country: "Svezia" },
  { code: "+47", country: "Norvegia" },
  { code: "+45", country: "Danimarca" },
  { code: "+358", country: "Finlandia" },
  { code: "+30", country: "Grecia" },
  { code: "+36", country: "Ungheria" },
  { code: "+420", country: "Rep. Ceca" },
  { code: "+40", country: "Romania" },
  { code: "+385", country: "Croazia" },
  { code: "+386", country: "Slovenia" },
  { code: "+381", country: "Serbia" },
  { code: "+355", country: "Albania" },
  { code: "+90", country: "Turchia" },
  { code: "+7", country: "Russia" },
  { code: "+61", country: "Australia" },
  { code: "+81", country: "Giappone" },
  { code: "+86", country: "Cina" },
  { code: "+55", country: "Brasile" },
  { code: "+52", country: "Messico" },
  { code: "+91", country: "India" },
];

export const PHONE_PREFIX_TO_COUNTRY: Record<string, string> = {
  "+39": "IT", "+1": "US", "+44": "GB", "+49": "DE",
  "+33": "FR", "+34": "ES", "+41": "CH", "+43": "AT",
  "+32": "BE", "+31": "NL", "+351": "PT", "+48": "PL",
  "+46": "SE", "+47": "NO", "+45": "DK", "+358": "FI",
  "+30": "GR", "+36": "HU", "+420": "CZ", "+40": "RO",
  "+385": "HR", "+386": "SI", "+381": "RS", "+355": "AL",
  "+90": "TR", "+7": "RU", "+61": "AU", "+81": "JP",
  "+86": "CN", "+55": "BR", "+52": "MX", "+91": "IN",
};

import { AppLanguage } from "@/lib/i18n";

export function buildEulaTexts(supportEmail: string): Record<AppLanguage, string> {
  return {
    it: `TERMINI E CONDIZIONI D'USO - BikerLink

1. ACCETTAZIONE DEI TERMINI
Utilizzando l'app BikerLink, accetti integralmente i presenti termini e condizioni.

2. DESCRIZIONE DEL SERVIZIO
BikerLink è una piattaforma che connette motociclisti (biker) e passeggeri (zavorrine) per condividere esperienze di viaggio in moto.

3. REGISTRAZIONE E ACCOUNT
- L'utente deve fornire informazioni veritiere durante la registrazione
- È responsabile della sicurezza delle proprie credenziali
- Deve avere almeno 18 anni per utilizzare il servizio

4. COMPORTAMENTO DEGLI UTENTI
- È vietato qualsiasi comportamento offensivo, molesto o discriminatorio
- È vietato condividere contenuti inappropriati
- Gli utenti devono rispettare il codice della strada

5. PRIVACY E DATI PERSONALI
- I dati personali sono trattati nel rispetto del GDPR
- La posizione GPS viene utilizzata solo per le funzionalità dell'app
- Le foto caricate sono soggette a moderazione

6. RESPONSABILITÀ
- BikerLink non è responsabile per incidenti durante i viaggi
- Ogni utente è responsabile della propria sicurezza
- L'uso di casco e protezioni è obbligatorio

7. SPONSOR E PUBBLICITÀ
- L'app contiene contenuti sponsorizzati da Syneco Lubrificanti
- I contenuti pubblicitari sono chiaramente identificati

8. MODIFICHE AI TERMINI
BikerLink si riserva il diritto di modificare i presenti termini in qualsiasi momento.

9. CONTATTI
Per domande o segnalazioni: ${supportEmail}`,

    en: `TERMS AND CONDITIONS OF USE - BikerLink

1. ACCEPTANCE OF TERMS
By using the BikerLink app, you fully accept these terms and conditions.

2. DESCRIPTION OF SERVICE
BikerLink is a platform that connects motorcyclists (bikers) and passengers (pillion riders) to share motorcycle travel experiences.

3. REGISTRATION AND ACCOUNT
- The user must provide truthful information during registration
- You are responsible for the security of your credentials
- You must be at least 18 years old to use the service

4. USER CONDUCT
- Any offensive, harassing or discriminatory behaviour is prohibited
- Sharing inappropriate content is prohibited
- Users must comply with road traffic laws

5. PRIVACY AND PERSONAL DATA
- Personal data is processed in accordance with the GDPR
- GPS location is used only for app features
- Uploaded photos are subject to moderation

6. LIABILITY
- BikerLink is not responsible for accidents during rides
- Each user is responsible for their own safety
- The use of helmets and protective gear is mandatory

7. SPONSORS AND ADVERTISING
- The app contains content sponsored by Syneco Lubrificanti
- Advertising content is clearly identified

8. CHANGES TO TERMS
BikerLink reserves the right to modify these terms at any time.

9. CONTACT
For questions or reports: ${supportEmail}`,

    de: `NUTZUNGSBEDINGUNGEN - BikerLink

1. ANNAHME DER BEDINGUNGEN
Durch die Nutzung der BikerLink-App akzeptierst du diese Nutzungsbedingungen vollständig.

2. BESCHREIBUNG DES DIENSTES
BikerLink ist eine Plattform, die Motorradfahrer (Biker) und Mitfahrer (Soziusfahrer) verbindet, um gemeinsame Motorradreisen zu erleben.

3. REGISTRIERUNG UND KONTO
- Der Nutzer muss bei der Registrierung wahrheitsgemäße Angaben machen
- Du bist für die Sicherheit deiner Anmeldedaten verantwortlich
- Du musst mindestens 18 Jahre alt sein, um den Dienst zu nutzen

4. NUTZERVERHALTEN
- Jegliches beleidigende, belästigende oder diskriminierende Verhalten ist verboten
- Das Teilen unangemessener Inhalte ist verboten
- Nutzer müssen die Straßenverkehrsordnung einhalten

5. DATENSCHUTZ UND PERSONENBEZOGENE DATEN
- Personenbezogene Daten werden gemäß der DSGVO verarbeitet
- Der GPS-Standort wird nur für App-Funktionen verwendet
- Hochgeladene Fotos unterliegen der Moderation

6. HAFTUNG
- BikerLink haftet nicht für Unfälle während der Fahrten
- Jeder Nutzer ist für seine eigene Sicherheit verantwortlich
- Das Tragen von Helm und Schutzausrüstung ist obligatorisch

7. SPONSOREN UND WERBUNG
- Die App enthält von Syneco Lubrificanti gesponserte Inhalte
- Werbeinhalte sind klar gekennzeichnet

8. ÄNDERUNGEN DER BEDINGUNGEN
BikerLink behält sich das Recht vor, diese Bedingungen jederzeit zu ändern.

9. KONTAKT
Für Fragen oder Meldungen: ${supportEmail}`,

    es: `TÉRMINOS Y CONDICIONES DE USO - BikerLink

1. ACEPTACIÓN DE LOS TÉRMINOS
Al usar la app BikerLink, aceptas íntegramente estos términos y condiciones.

2. DESCRIPCIÓN DEL SERVICIO
BikerLink es una plataforma que conecta motociclistas (bikers) y pasajeros (pillion riders) para compartir experiencias de viaje en moto.

3. REGISTRO Y CUENTA
- El usuario debe proporcionar información veraz durante el registro
- Eres responsable de la seguridad de tus credenciales
- Debes tener al menos 18 años para usar el servicio

4. COMPORTAMIENTO DE LOS USUARIOS
- Está prohibido cualquier comportamiento ofensivo, acosador o discriminatorio
- Está prohibido compartir contenidos inapropiados
- Los usuarios deben respetar el código de tráfico

5. PRIVACY Y DATOS PERSONALES
- Los datos personales se tratan de conformidad con el RGPD
- La ubicación GPS se utiliza únicamente para las funcionalidades de la app
- Las fotos cargadas están sujetas a moderación

6. RESPONSABILIDAD
- BikerLink no es responsable de los accidentes ocurridos durante los trayectos
- Cada usuario es responsable de su propia seguridad
- El uso de casco y equipo de protección es obligatorio

7. PATROCINADORES Y PUBLICIDAD
- La app contiene contenidos patrocinados por Syneco Lubrificanti
- Los contenidos publicitarios están claramente identificados

8. MODIFICACIONES DE LOS TÉRMINOS
BikerLink se reserva el diritto de modificar estos términos en cualquier momento.

9. CONTACTO
Para preguntas o notificaciones: ${supportEmail}`,

    fr: `CONDITIONS GÉNÉRALES D'UTILISATION - BikerLink

1. ACCEPTATION DES CONDITIONS
En utilisant l'app BikerLink, vous acceptez intégralement les présentes conditions générales.

2. DESCRIPTION DU SERVICE
BikerLink est una plateforme qui connecte des motocyclistes (bikers) et des passagers (passagers en tandem) pour partager des expériences de voyage en moto.

3. INSCRIPTION ET COMPTE
- L'utilisateur doit fournir des informations exactes lors de l'inscription
- Vous êtes responsable de la sécurité de vos identifiants
- Vous devez avoir au moins 18 ans pour utiliser le service

4. COMPORTEMENT DES UTILISATEURS
- Tout comportement offensant, harcelant ou discriminatoire est interdit
- Le partage de contenus inappropriés est interdit
- Les utilisateurs doivent respecter le code de la route

5. CONFIDENTIALITÉ ET DONNÉES PERSONNELLES
- Les données personnelles sont traitées conformément au RGPD
- La localisation GPS est utilisée uniquement pour les fonctionnalités de l'app
- Les photos téléchargées sont soumises à modération

6. RESPONSABILITÉ
- BikerLink n'est pas responsable des accidents survenus lors des trajets
- Chaque utilisateur est responsable de sa propre sécurité
- Le port du casque et des équipements de protection est obligatoire

7. SPONSORS ET PUBLICITÉ
- L'app contiene des contenus sponsorisés par Syneco Lubrificanti
- Les contenus publicitaires sont clairement identifiés

8. MODIFICATIONS DES CONDITIONS
BikerLink se réserve le droit de modifier les présentes conditions à tout moment.

9. CONTACT
Pour toute question ou signalement : ${supportEmail}`,

    el: `ΌΡΟΙ ΚΑΙ ΠΡΟΫΠΟΘΈΣΕΙΣ ΧΡΉΣΗΣ - BikerLink

1. ΑΠΟΔΟΧΗ ΟΡΩΝ
Χρησιμοποιώντας την εφαρμογή BikerLink, αποδέχεστε πλήρως τους παρόντες όρους και προϋποθέσεις.

2. ΠΕΡΙΓΡΑΦΗ ΥΠΗΡΕΣΙΑΣ
Το BikerLink είναι μια πλατφόρμα που συνδέει μοτοσυκλετιστές και επιβάτες για κοινές εμπειρίες ταξιδιού.

3. ΕΓΓΡΑΦΗ ΚΑΙ ΛΟΓΑΡΙΑΣΜΟΣ
- Ο χρήστης πρέπει να παρέχει αληθείς πληροφορίες κατά την εγγραφή
- Είστε υπεύθυνοι για την ασφάλεια των διαπιστευτηρίων σας
- Πρέπει να είστε τουλάχιστον 18 ετών για να χρησιμοποιήσετε την υπηρεσία

9. ΕΠΙΚΟΙΝΩΝΙΑ
Για ερωτήσεις ή αναφορές: ${supportEmail}`,

    tr: `KULLANIM KOŞULLARI - BikerLink

1. KOŞULLARIN KABULÜ
BikerLink uygulamasını kullanarak bu kullanım koşullarını tam olarak kabul etmiş sayılırsınız.

2. HİZMET TANIMI
BikerLink, motosikletçileri (biker) ve yolcuları (zavorrina) motosiklet seyahat deneyimlerini paylaşmak için bir araya getiren bir platformdur.

3. KAYIT VE HESAP
- Kullanıcı, kayıt sırasında doğru bilgi sağlamalıdır
- Hesap bilgilerinizin güvenliğinden siz sorumlusunuz
- Hizmeti kullanmak için en az 18 yaşında olmanız gerekmektedir

4. KULLANICI DAVRANIŞI
- Hakaret edici, taciz edici veya ayrımcı davranışlar yasaktır
- Uygunsuz içerik paylaşımı yasaktır
- Kullanıcılar trafik kurallarına uymak zorundadır

5. GİZLİLİK VE KİŞİSEL VERİLER
- Kişisel veriler GDPR'a uygun olarak işlenmektedir
- GPS konumu yalnızca uygulama özellikleri için kullanılmaktadır
- Yüklenen fotoğraflar moderasyona tabidir

6. SORUMLULUK
- BikerLink, sürüşler sırasında meydana gelen kazalardan sorumlu değildir
- Her kullanıcı kendi güvenliğinden sorumludur
- Kask ve koruyucu ekipman kullanımı zorunludur

7. SPONSORLAR VE REKLAMCILIK
- Uygulama, Syneco Lubrificanti tarafından desteklenen içerikler barındırmaktadır
- Reklam içerikleri açıkça belirtilmektedir

8. KOŞULLARDA DEĞİŞİKLİK
BikerLink, bu koşulları istediği zaman değiştirme hakkını saklı tutar.

9. İLETİŞİM
Sorular veya bildirimler için: ${supportEmail}`,
  };
}
