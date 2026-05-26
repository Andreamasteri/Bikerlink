import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { translationKeys } from "@shared/db";
import { translationKeySchema } from "@shared/db";
import { sendError } from "../../lib/api-response";

const router = Router();

const VALID_LANGS = new Set(["it", "en", "de", "es", "fr", "el", "tr"]);

router.get("/table", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(translationKeys).orderBy(translationKeys.position, translationKeys.key);
    return res.json(rows);
  } catch (err) {
    console.error("[translations] GET /table error:", err);
    return sendError(res, 500, "Errore caricamento traduzioni");
  }
});

router.patch("/key", async (req: Request, res: Response) => {
  try {
    const parsed = translationKeySchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, parsed.error.issues[0].message);

    const { key, lang, value } = parsed.data;

    if (!VALID_LANGS.has(lang)) {
      return sendError(res, 400, `Lingua non valida: ${lang}`);
    }

    const [updated] = await db
      .update(translationKeys)
      .set({ [lang]: value })
      .where(sql`${translationKeys.key} = ${key}`)
      .returning();

    if (!updated) return sendError(res, 404, `Chiave non trovata: ${key}`);

    return res.json(updated);
  } catch (err) {
    console.error("[translations] PATCH /key error:", err);
    return sendError(res, 500, "Errore salvataggio traduzione");
  }
});

router.post("/ai-complete", async (_req: Request, res: Response) => {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return res.json({ message: "AI non configurata: OPENAI_API_KEY mancante" });
    }
    return res.json({ message: "AI non configurata" });
  } catch (err) {
    console.error("[translations] POST /ai-complete error:", err);
    return sendError(res, 500, "Errore completamento AI");
  }
});

export async function seedTranslationKeys(): Promise<void> {
  const seed: Array<typeof translationKeys.$inferInsert> = [
    { key: "onboarding.welcome.title", position: "Onboarding / Benvenuto", it: "Benvenuto in BikerLink", en: "Welcome to BikerLink", de: "Willkommen bei BikerLink", es: "Bienvenido a BikerLink", fr: "Bienvenue sur BikerLink", el: "Καλώς ήρθατε στο BikerLink", tr: "BikerLink'e hoş geldiniz" },
    { key: "onboarding.welcome.subtitle", position: "Onboarding / Benvenuto", it: "La community dei motociclisti", en: "The motorcyclists community", de: "Die Motorradfahrer-Community", es: "La comunidad de motociclistas", fr: "La communauté des motards", el: "Η κοινότητα μοτοσικλετιστών", tr: "Motosikletçiler topluluğu" },
    { key: "auth.login.title", position: "Autenticazione / Login", it: "Accedi", en: "Sign In", de: "Anmelden", es: "Iniciar sesión", fr: "Se connecter", el: "Σύνδεση", tr: "Giriş Yap" },
    { key: "auth.login.email", position: "Autenticazione / Login", it: "Email", en: "Email", de: "E-Mail", es: "Correo electrónico", fr: "E-mail", el: "Email", tr: "E-posta" },
    { key: "auth.login.password", position: "Autenticazione / Login", it: "Password", en: "Password", de: "Passwort", es: "Contraseña", fr: "Mot de passe", el: "Κωδικός", tr: "Şifre" },
    { key: "auth.register.title", position: "Autenticazione / Registrazione", it: "Crea account", en: "Create account", de: "Konto erstellen", es: "Crear cuenta", fr: "Créer un compte", el: "Δημιουργία λογαριασμού", tr: "Hesap oluştur" },
    { key: "nav.home", position: "Navigazione", it: "Home", en: "Home", de: "Startseite", es: "Inicio", fr: "Accueil", el: "Αρχική", tr: "Ana Sayfa" },
    { key: "nav.map", position: "Navigazione", it: "Mappa", en: "Map", de: "Karte", es: "Mapa", fr: "Carte", el: "Χάρτης", tr: "Harita" },
    { key: "nav.community", position: "Navigazione", it: "Community", en: "Community", de: "Community", es: "Comunidad", fr: "Communauté", el: "Κοινότητα", tr: "Topluluk" },
    { key: "nav.profile", position: "Navigazione", it: "Profilo", en: "Profile", de: "Profil", es: "Perfil", fr: "Profil", el: "Προφίλ", tr: "Profil" },
    { key: "common.save", position: "Comune / Azioni", it: "Salva", en: "Save", de: "Speichern", es: "Guardar", fr: "Enregistrer", el: "Αποθήκευση", tr: "Kaydet" },
    { key: "common.cancel", position: "Comune / Azioni", it: "Annulla", en: "Cancel", de: "Abbrechen", es: "Cancelar", fr: "Annuler", el: "Ακύρωση", tr: "İptal" },
    { key: "common.confirm", position: "Comune / Azioni", it: "Conferma", en: "Confirm", de: "Bestätigen", es: "Confirmar", fr: "Confirmer", el: "Επιβεβαίωση", tr: "Onayla" },
    { key: "common.delete", position: "Comune / Azioni", it: "Elimina", en: "Delete", de: "Löschen", es: "Eliminar", fr: "Supprimer", el: "Διαγραφή", tr: "Sil" },
    { key: "common.loading", position: "Comune / Stato", it: "Caricamento...", en: "Loading...", de: "Laden...", es: "Cargando...", fr: "Chargement...", el: "Φόρτωση...", tr: "Yükleniyor..." },
    { key: "common.error.generic", position: "Comune / Errori", it: "Si è verificato un errore", en: "An error occurred", de: "Ein Fehler ist aufgetreten", es: "Se produjo un error", fr: "Une erreur est survenue", el: "Παρουσιάστηκε σφάλμα", tr: "Bir hata oluştu" },
    { key: "common.error.network", position: "Comune / Errori", it: "Errore di rete", en: "Network error", de: "Netzwerkfehler", es: "Error de red", fr: "Erreur réseau", el: "Σφάλμα δικτύου", tr: "Ağ hatası" },
    { key: "sos.title", position: "SOS / Emergenza", it: "Emergenza SOS", en: "SOS Emergency", de: "SOS-Notfall", es: "Emergencia SOS", fr: "Urgence SOS", el: "Κατάσταση έκτακτης ανάγκης SOS", tr: "SOS Acil Durum" },
    { key: "sos.activate", position: "SOS / Emergenza", it: "Attiva SOS", en: "Activate SOS", de: "SOS aktivieren", es: "Activar SOS", fr: "Activer SOS", el: "Ενεργοποίηση SOS", tr: "SOS'u Etkinleştir" },
    { key: "matching.title", position: "Matching / Ricerca", it: "Trova bikers", en: "Find bikers", de: "Biker finden", es: "Encontrar bikers", fr: "Trouver des bikers", el: "Εύρεση bikers", tr: "Biker bul" },
  ];

  try {
    await db.insert(translationKeys).values(seed).onConflictDoNothing();
    console.log("[translations] Seed completato:", seed.length, "chiavi inserite (o già presenti)");
  } catch (err) {
    console.error("[translations] Seed error:", err);
  }
}

export default router;
