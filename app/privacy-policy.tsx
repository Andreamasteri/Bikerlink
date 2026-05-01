import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,

} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useLanguage } from "@/lib/language-context";
import type { AppLanguage } from "@/lib/i18n";
import { PRIVACY_POLICY_IT } from "@shared/privacy-policy-it";

const PRIVACY_POLICIES: Record<AppLanguage, string> = {
  it: PRIVACY_POLICY_IT,

  en: `PRIVACY POLICY

Last updated: 20/03/2026

1. DATA CONTROLLER

The data controller for personal data is BikerLink. For any questions regarding the processing of your personal data, you can contact us at: privacy@bikerlink.app

2. DATA COLLECTED

When you use the BikerLink application, we collect the following categories of personal data:

- Email address
- Phone number
- Nickname (username)
- Year of birth
- Country of residence
- Region of residence
- User type (biker, pillion, couple)
- Photographs uploaded by the user
- GPS location (geolocation data)

3. PURPOSES OF PROCESSING

The personal data collected is processed for the following purposes:

- Application operation: to ensure the correct functioning of the app's features.
- Matching: to enable connections between users with similar interests.
- Chat: to enable communication between users within the app.
- Contest: to manage participation in competitions and events organised through the app.

4. LEGAL BASIS FOR PROCESSING

The legal basis for processing your personal data is the consent expressed by the user at the time of registration and use of the application, pursuant to Art. 6(1)(a) of Regulation (EU) 2016/679 (GDPR).

5. DATA RETENTION

Personal data will be retained for the time strictly necessary to fulfil the purposes for which they were collected. In the event of account deletion, personal data will be erased within 30 days, unless legal obligations require a longer retention period.

6. SHARING WITH THIRD PARTIES

Your personal data may be shared with:

- Syneco, as a sponsor of the application, for promotional and marketing purposes related to the services offered through BikerLink.

Data may be processed on cloud infrastructure that may be located outside the European Economic Area. In such cases, the transfer is governed by the Standard Contractual Clauses approved by the European Commission pursuant to Art. 46 GDPR.

7. YOUR RIGHTS

Under the GDPR, you have the right to:

- Access: obtain confirmation of whether personal data concerning you is being processed and access such data.
- Rectification: obtain the correction of inaccurate personal data concerning you.
- Erasure: obtain the deletion of personal data concerning you ("right to be forgotten").
- Portability: receive personal data concerning you in a structured, commonly used and machine-readable format.
- Objection: object at any time to the processing of personal data concerning you.

8. HOW TO EXERCISE YOUR RIGHTS

To exercise the rights listed above, you can send a request to: privacy@bikerlink.app

We will respond to your request within 30 days of receipt.

9. COOKIES AND SESSIONS

The BikerLink application uses technical and session cookies necessary for the correct operation of the app. These cookies are not used for profiling or marketing purposes. Session cookies are automatically deleted when the application is closed.

10. CHANGES TO THIS POLICY

BikerLink reserves the right to modify this privacy policy at any time. Changes will be communicated to users via in-app notification or by publishing the updated version. Continued use of the application after the publication of changes constitutes acceptance of the same.

For any questions or clarifications, please contact us at: privacy@bikerlink.app`,

  de: `DATENSCHUTZERKLÄRUNG

Letzte Aktualisierung: 20.03.2026

1. VERANTWORTLICHER FÜR DIE DATENVERARBEITUNG

Der Verantwortliche für die Verarbeitung personenbezogener Daten ist BikerLink. Bei Fragen zur Verarbeitung Ihrer personenbezogenen Daten können Sie uns unter folgender E-Mail-Adresse kontaktieren: privacy@bikerlink.app

2. ERHOBENE DATEN

Im Rahmen der Nutzung der BikerLink-Anwendung erheben wir folgende Kategorien personenbezogener Daten:

- E-Mail-Adresse
- Telefonnummer
- Nickname (Benutzername)
- Geburtsjahr
- Wohnsitzland
- Wohnsitzregion
- Benutzertyp (Biker, Sozia, Paar)
- Vom Nutzer hochgeladene Fotos
- GPS-Standort (Geolokalisierungsdaten)

3. ZWECKE DER VERARBEITUNG

Die erhobenen personenbezogenen Daten werden für folgende Zwecke verarbeitet:

- Anwendungsbetrieb: Gewährleistung des ordnungsgemäßen Betriebs der App-Funktionen.
- Matching: Verbindung von Nutzern mit ähnlichen Interessen ermöglichen.
- Chat: Kommunikation zwischen Nutzern innerhalb der App ermöglichen.
- Wettbewerbe: Verwaltung der Teilnahme an Wettbewerben und Veranstaltungen über die App.

4. RECHTSGRUNDLAGE DER VERARBEITUNG

Die Rechtsgrundlage für die Verarbeitung Ihrer personenbezogenen Daten ist die Einwilligung des Nutzers zum Zeitpunkt der Registrierung und Nutzung der Anwendung gemäß Art. 6 Abs. 1 lit. a der Verordnung (EU) 2016/679 (DSGVO).

5. DATENSPEICHERUNG

Personenbezogene Daten werden nur so lange gespeichert, wie es zur Erfüllung der Zwecke, für die sie erhoben wurden, erforderlich ist. Im Falle der Kontolöschung werden die personenbezogenen Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten eine längere Speicherung erfordern.

6. WEITERGABE AN DRITTE

Ihre personenbezogenen Daten können weitergegeben werden an:

- Syneco, als Sponsor der Anwendung, für Werbe- und Marketingzwecke im Zusammenhang mit den über BikerLink angebotenen Diensten.

Daten können auf Cloud-Infrastrukturen verarbeitet werden, die sich außerhalb des Europäischen Wirtschaftsraums befinden können. In solchen Fällen wird der Transfer durch die von der Europäischen Kommission genehmigten Standardvertragsklauseln gemäß Art. 46 DSGVO geregelt.

7. IHRE RECHTE

Gemäß der DSGVO haben Sie das Recht auf:

- Auskunft: Bestätigung zu erhalten, ob personenbezogene Daten über Sie verarbeitet werden, und Zugang zu diesen Daten.
- Berichtigung: Unrichtige personenbezogene Daten über Sie berichtigen zu lassen.
- Löschung: Löschung der Sie betreffenden personenbezogenen Daten zu verlangen ("Recht auf Vergessenwerden").
- Datenübertragbarkeit: Ihre personenbezogenen Daten in einem strukturierten, gängigen und maschinenlesbaren Format zu erhalten.
- Widerspruch: Der Verarbeitung der Sie betreffenden personenbezogenen Daten jederzeit zu widersprechen.

8. AUSÜBUNG IHRER RECHTE

Um die oben genannten Rechte auszuüben, können Sie eine Anfrage senden an: privacy@bikerlink.app

Wir werden Ihre Anfrage innerhalb von 30 Tagen nach Eingang beantworten.

9. COOKIES UND SITZUNGEN

Die BikerLink-Anwendung verwendet technische Cookies und Sitzungscookies, die für den ordnungsgemäßen Betrieb der App erforderlich sind. Diese Cookies werden nicht für Profiling- oder Marketingzwecke verwendet. Sitzungscookies werden beim Schließen der Anwendung automatisch gelöscht.

10. ÄNDERUNGEN DIESER DATENSCHUTZERKLÄRUNG

BikerLink behält sich das Recht vor, diese Datenschutzerklärung jederzeit zu ändern. Änderungen werden den Nutzern per In-App-Benachrichtigung oder durch Veröffentlichung der aktualisierten Version mitgeteilt. Die fortgesetzte Nutzung der Anwendung nach der Veröffentlichung von Änderungen gilt als Zustimmung zu diesen.

Bei Fragen oder Unklarheiten wenden Sie sich bitte an: privacy@bikerlink.app`,

  es: `POLÍTICA DE PRIVACIDAD

Última actualización: 20/03/2026

1. RESPONSABLE DEL TRATAMIENTO

El responsable del tratamiento de los datos personales es BikerLink. Para cualquier consulta relativa al tratamiento de sus datos personales, puede contactarnos en la dirección de correo electrónico: privacy@bikerlink.app

2. DATOS RECOGIDOS

En el marco del uso de la aplicación BikerLink, recopilamos las siguientes categorías de datos personales:

- Dirección de correo electrónico
- Número de teléfono
- Apodo (nombre de usuario)
- Año de nacimiento
- País de residencia
- Región de residencia
- Tipo de usuario (biker, pasajera, pareja)
- Fotografías cargadas por el usuario
- Ubicación GPS (datos de geolocalización)

3. FINALIDADES DEL TRATAMIENTO

Los datos personales recopilados se tratan con las siguientes finalidades:

- Funcionamiento de la aplicación: garantizar el correcto funcionamiento de las funciones de la app.
- Matching: permitir la conexión entre usuarios con intereses similares.
- Chat: habilitar la comunicación entre usuarios dentro de la app.
- Concursos: gestionar la participación en concursos y competiciones organizados a través de la app.

4. BASE JURÍDICA DEL TRATAMIENTO

La base jurídica para el tratamiento de sus datos personales es el consentimiento expresado por el usuario en el momento del registro y uso de la aplicación, de conformidad con el art. 6, apartado 1, letra a) del Reglamento (UE) 2016/679 (RGPD).

5. CONSERVACIÓN DE LOS DATOS

Los datos personales se conservarán durante el tiempo estrictamente necesario para cumplir las finalidades para las que fueron recopilados. En caso de eliminación de la cuenta, los datos personales serán suprimidos en un plazo de 30 días, salvo que obligaciones legales requieran una conservación más prolongada.

6. COMPARTICIÓN CON TERCEROS

Sus datos personales podrán compartirse con:

- Syneco, en calidad de patrocinador de la aplicación, con fines promocionales y de marketing relacionados con los servicios ofrecidos a través de BikerLink.

Los datos pueden ser tratados en infraestructura en la nube que puede estar ubicada fuera del Espacio Económico Europeo. En tales casos, la transferencia se rige por las Cláusulas Contractuales Tipo aprobadas por la Comisión Europea de conformidad con el art. 46 RGPD.

7. DERECHOS DEL USUARIO

De conformidad con el RGPD, usted tiene derecho a:

- Acceso: obtener confirmación de la existencia de un tratamiento de datos personales que le conciernan y acceder a dichos datos.
- Rectificación: obtener la rectificación de los datos personales inexactos que le conciernan.
- Supresión: obtener la eliminación de los datos personales que le conciernan ("derecho al olvido").
- Portabilidad: recibir los datos personales que le conciernan en un formato estructurado, de uso común y legible por máquina.
- Oposición: oponerse en cualquier momento al tratamiento de los datos personales que le conciernan.

8. CÓMO EJERCER SUS DERECHOS

Para ejercer los derechos enumerados anteriormente, puede enviar una solicitud a la dirección de correo electrónico: privacy@bikerlink.app

Responderemos a su solicitud en un plazo de 30 días desde su recepción.

9. COOKIES Y SESIONES

La aplicación BikerLink utiliza cookies técnicas y de sesión necesarias para el correcto funcionamiento de la app. Estas cookies no se utilizan con fines de elaboración de perfiles o marketing. Las cookies de sesión se eliminan automáticamente al cerrar la aplicación.

10. MODIFICACIONES DE LA POLÍTICA

BikerLink se reserva el derecho de modificar la presente política de privacidad en cualquier momento. Los cambios se comunicarán a los usuarios mediante notificación en la aplicación o mediante la publicación de la versión actualizada. El uso continuado de la aplicación tras la publicación de los cambios constituye la aceptación de los mismos.

Para cualquier pregunta o aclaración, no dude en contactarnos en: privacy@bikerlink.app`,

  fr: `POLITIQUE DE CONFIDENTIALITÉ

Dernière mise à jour : 20/03/2026

1. RESPONSABLE DU TRAITEMENT

Le responsable du traitement des données personnelles est BikerLink. Pour toute question relative au traitement de vos données personnelles, vous pouvez nous contacter à l'adresse e-mail : privacy@bikerlink.app

2. DONNÉES COLLECTÉES

Dans le cadre de l'utilisation de l'application BikerLink, nous collectons les catégories suivantes de données personnelles :

- Adresse e-mail
- Numéro de téléphone
- Pseudo (nom d'utilisateur)
- Année de naissance
- Pays de résidence
- Région de résidence
- Type d'utilisateur (biker, passagère, couple)
- Photographies téléchargées par l'utilisateur
- Localisation GPS (données de géolocalisation)

3. FINALITÉS DU TRAITEMENT

Les données personnelles collectées sont traitées aux fins suivantes :

- Fonctionnement de l'application : assurer le bon fonctionnement des fonctionnalités de l'app.
- Mise en relation : permettre la connexion entre utilisateurs ayant des intérêts similaires.
- Chat : activer la communication entre utilisateurs au sein de l'app.
- Concours : gérer la participation à des concours et compétitions organisés via l'app.

4. BASE JURIDIQUE DU TRAITEMENT

La base juridique du traitement de vos données personnelles est le consentement exprimé par l'utilisateur lors de l'inscription et de l'utilisation de l'application, conformément à l'art. 6, par. 1, point a) du Règlement (UE) 2016/679 (RGPD).

5. CONSERVATION DES DONNÉES

Les données personnelles seront conservées pendant le temps strictement nécessaire à la réalisation des finalités pour lesquelles elles ont été collectées. En cas de suppression du compte, les données personnelles seront effacées dans un délai de 30 jours, sauf obligations légales imposant une conservation plus longue.

6. PARTAGE AVEC DES TIERS

Vos données personnelles pourront être partagées avec :

- Syneco, en qualité de sponsor de l'application, à des fins promotionnelles et marketing liées aux services proposés via BikerLink.

Les données peuvent être traitées sur une infrastructure cloud pouvant être située en dehors de l'Espace économique européen. Dans ce cas, le transfert est régi par les Clauses Contractuelles Types approuvées par la Commission européenne conformément à l'art. 46 RGPD.

7. DROITS DE L'UTILISATEUR

Conformément au RGPD, vous disposez du droit :

- D'accès : obtenir la confirmation de l'existence d'un traitement de données personnelles vous concernant et accéder à ces données.
- De rectification : obtenir la rectification des données personnelles inexactes vous concernant.
- D'effacement : obtenir la suppression des données personnelles vous concernant ("droit à l'oubli").
- De portabilité : recevoir les données personnelles vous concernant dans un format structuré, couramment utilisé et lisible par machine.
- D'opposition : vous opposer à tout moment au traitement des données personnelles vous concernant.

8. COMMENT EXERCER VOS DROITS

Pour exercer les droits énumérés ci-dessus, vous pouvez envoyer une demande à l'adresse e-mail : privacy@bikerlink.app

Nous répondrons à votre demande dans un délai de 30 jours à compter de sa réception.

9. COOKIES ET SESSIONS

L'application BikerLink utilise des cookies techniques et de session nécessaires au bon fonctionnement de l'app. Ces cookies ne sont pas utilisés à des fins de profilage ou de marketing. Les cookies de session sont automatiquement supprimés à la fermeture de l'application.

10. MODIFICATIONS DE LA POLITIQUE

BikerLink se réserve le droit de modifier la présente politique de confidentialité à tout moment. Les modifications seront communiquées aux utilisateurs par notification dans l'application ou par publication de la version mise à jour. L'utilisation continue de l'application après la publication des modifications vaut acceptation de celles-ci.

Pour toute question ou précision, n'hésitez pas à nous contacter à l'adresse : privacy@bikerlink.app`,

  tr: `GİZLİLİK POLİTİKASI

Son güncelleme: 20/03/2026

1. VERİ SORUMLUSU

Kişisel verilerin işlenmesinden sorumlu taraf BikerLink'tir. Kişisel verilerinizin işlenmesiyle ilgili sorularınız için şu adrese ulaşabilirsiniz: privacy@bikerlink.app

2. TOPLANAN VERİLER

BikerLink uygulamasını kullandığınızda aşağıdaki kişisel veri kategorileri toplanmaktadır:

- E-posta adresi
- Telefon numarası
- Takma ad (kullanıcı adı)
- Doğum yılı
- İkamet ülkesi
- İkamet bölgesi
- Kullanıcı tipi (biker, zavorrina, çift)
- Kullanıcı tarafından yüklenen fotoğraflar
- GPS konumu (konum verileri)

3. İŞLEME AMAÇLARI

Toplanan kişisel veriler aşağıdaki amaçlarla işlenmektedir:

- Uygulama işleyişi: uygulamanın özelliklerinin doğru çalışmasını sağlamak.
- Eşleştirme: benzer ilgi alanlarına sahip kullanıcılar arasında bağlantı kurulmasını sağlamak.
- Sohbet: kullanıcılar arasında uygulama içi iletişim sağlamak.
- Yarışma: uygulama üzerinden düzenlenen yarışma ve etkinliklere katılımı yönetmek.

4. İŞLEMENİN HUKUKİ DAYANAĞI

Kişisel verilerinizin işlenmesinin hukuki dayanağı, kayıt sırasında ve uygulamanın kullanımı sürecinde kullanıcı tarafından verilen rızadır (AB 2016/679 Tüzüğü (GDPR) Madde 6(1)(a) uyarınca).

5. VERİ SAKLAMA SÜRESİ

Kişisel veriler, toplandıkları amaçların yerine getirilmesi için zorunlu olan süre boyunca saklanacaktır. Hesap silinmesi durumunda, kişisel veriler 30 gün içinde silinecektir; yasal yükümlülükler daha uzun bir saklama süresi gerektirmedikçe.

6. ÜÇÜNCÜ TARAFLARLA PAYLAŞIM

Kişisel verileriniz şu taraflarla paylaşılabilir:

- Syneco, uygulamanın sponsoru olarak, BikerLink aracılığıyla sunulan hizmetlere ilişkin promosyon ve pazarlama amaçlarıyla.

Veriler, Avrupa Ekonomik Alanı dışında bulunabilecek bulut altyapısında işlenebilir. Bu gibi durumlarda transfer, Avrupa Komisyonu tarafından GDPR Madde 46 kapsamında onaylanan Standart Sözleşme Hükümleri çerçevesinde gerçekleştirilir.

7. HAKLARINIZ

GDPR kapsamında aşağıdaki haklara sahipsiniz:

- Erişim: kendinizle ilgili kişisel verilerin işlenip işlenmediğini öğrenme ve bu verilere erişme.
- Düzeltme: kendinizle ilgili yanlış kişisel verilerin düzeltilmesini talep etme.
- Silme: kendinizle ilgili kişisel verilerin silinmesini talep etme ("unutulma hakkı").
- Taşınabilirlik: kendinizle ilgili kişisel verileri yapılandırılmış, yaygın kullanılan ve makine tarafından okunabilir bir formatta alma.
- İtiraz: kendinizle ilgili kişisel verilerin işlenmesine her zaman itiraz etme.

8. HAKLARINIZI KULLANMA

Yukarıda belirtilen hakları kullanmak için şu adrese talep gönderebilirsiniz: privacy@bikerlink.app

Talebinize alındığından itibaren 30 gün içinde yanıt vereceğiz.

9. ÇEREZLER VE OTURUMLAR

BikerLink uygulaması, uygulamanın doğru çalışması için gerekli teknik ve oturum çerezleri kullanmaktadır. Bu çerezler profilleme veya pazarlama amacıyla kullanılmamaktadır. Oturum çerezleri, uygulama kapatıldığında otomatik olarak silinmektedir.

10. POLİTİKA DEĞİŞİKLİKLERİ

BikerLink, bu gizlilik politikasını istediği zaman değiştirme hakkını saklı tutar. Değişiklikler, uygulama içi bildirim veya güncellenmiş sürümün yayımlanması yoluyla kullanıcılara iletilecektir. Değişikliklerin yayımlanmasından sonra uygulamayı kullanmaya devam etmek bu değişikliklerin kabulü anlamına gelir.

Sorularınız veya açıklamalar için lütfen şu adrese ulaşın: privacy@bikerlink.app`,
};

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();

  const { data, isLoading } = useQuery<{ text: string }>({
    queryKey: ["/api/settings/privacy-policy"],
  });

  const localizedDefault = PRIVACY_POLICIES[language] ?? PRIVACY_POLICIES.it;

  const policyText =
    data?.text && data.text.trim().length > 0
      ? data.text
      : localizedDefault;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
            { paddingBottom: insets.bottom + 20 },
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
