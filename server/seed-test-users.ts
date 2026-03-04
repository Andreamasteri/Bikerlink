import { db } from "./db";
import { users, userProfiles } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

const VENETO_LOCATIONS = [
  { city: "Venezia", lat: 45.4408, lng: 12.3155 },
  { city: "Padova", lat: 45.4064, lng: 11.8768 },
  { city: "Verona", lat: 45.4384, lng: 10.9916 },
  { city: "Vicenza", lat: 45.5455, lng: 11.5354 },
  { city: "Treviso", lat: 45.6669, lng: 12.2430 },
  { city: "Belluno", lat: 46.1427, lng: 12.2167 },
  { city: "Rovigo", lat: 45.0700, lng: 11.7897 },
  { city: "Mestre", lat: 45.4906, lng: 12.2383 },
  { city: "Chioggia", lat: 45.2186, lng: 12.2791 },
  { city: "Bassano del Grappa", lat: 45.7660, lng: 11.7353 },
  { city: "Cortina d'Ampezzo", lat: 46.5369, lng: 12.1356 },
  { city: "Jesolo", lat: 45.5282, lng: 12.6442 },
  { city: "Schio", lat: 45.7128, lng: 11.3567 },
  { city: "Castelfranco Veneto", lat: 45.6721, lng: 11.9265 },
  { city: "Conegliano", lat: 45.8872, lng: 12.2970 },
  { city: "San Donà di Piave", lat: 45.6314, lng: 12.5667 },
  { city: "Cittadella", lat: 45.6492, lng: 11.7834 },
  { city: "Mirano", lat: 45.4945, lng: 12.1088 },
  { city: "Feltre", lat: 46.0190, lng: 11.9082 },
  { city: "Montebelluna", lat: 45.7750, lng: 12.0440 },
  { city: "Este", lat: 45.2261, lng: 11.6581 },
  { city: "Abano Terme", lat: 45.3596, lng: 11.7900 },
  { city: "Legnago", lat: 45.1918, lng: 11.3050 },
  { city: "Monselice", lat: 45.2386, lng: 11.7499 },
  { city: "Thiene", lat: 45.7086, lng: 11.4783 },
  { city: "Arzignano", lat: 45.5197, lng: 11.3326 },
  { city: "Asiago", lat: 45.8761, lng: 11.5130 },
  { city: "Pieve di Cadore", lat: 46.4268, lng: 12.3693 },
  { city: "Caorle", lat: 45.5988, lng: 12.8837 },
  { city: "Noale", lat: 45.5505, lng: 12.0716 },
];

interface TestUser {
  num: number;
  sex: "male" | "female";
  userType: "biker" | "zavorrina" | "coppia";
  coupleSexConfig?: "mf" | "mm" | "ff";
}

const TEST_USERS: TestUser[] = [
  { num: 1, sex: "male", userType: "biker" },
  { num: 2, sex: "male", userType: "biker" },
  { num: 3, sex: "male", userType: "biker" },
  { num: 4, sex: "male", userType: "biker" },
  { num: 5, sex: "male", userType: "biker" },
  { num: 6, sex: "female", userType: "biker" },
  { num: 7, sex: "female", userType: "biker" },
  { num: 8, sex: "female", userType: "biker" },
  { num: 9, sex: "female", userType: "biker" },
  { num: 10, sex: "female", userType: "biker" },
  { num: 11, sex: "male", userType: "zavorrina" },
  { num: 12, sex: "male", userType: "zavorrina" },
  { num: 13, sex: "male", userType: "zavorrina" },
  { num: 14, sex: "male", userType: "zavorrina" },
  { num: 15, sex: "male", userType: "zavorrina" },
  { num: 16, sex: "female", userType: "zavorrina" },
  { num: 17, sex: "female", userType: "zavorrina" },
  { num: 18, sex: "female", userType: "zavorrina" },
  { num: 19, sex: "female", userType: "zavorrina" },
  { num: 20, sex: "female", userType: "zavorrina" },
  { num: 21, sex: "male", userType: "coppia", coupleSexConfig: "mf" },
  { num: 22, sex: "male", userType: "coppia", coupleSexConfig: "mf" },
  { num: 23, sex: "male", userType: "coppia", coupleSexConfig: "mf" },
  { num: 24, sex: "male", userType: "coppia", coupleSexConfig: "mm" },
  { num: 25, sex: "male", userType: "coppia", coupleSexConfig: "mm" },
  { num: 26, sex: "male", userType: "coppia", coupleSexConfig: "mm" },
  { num: 27, sex: "female", userType: "coppia", coupleSexConfig: "ff" },
  { num: 28, sex: "female", userType: "coppia", coupleSexConfig: "ff" },
  { num: 29, sex: "female", userType: "coppia", coupleSexConfig: "ff" },
  { num: 30, sex: "female", userType: "coppia", coupleSexConfig: "ff" },
];

async function seed() {
  console.log("[SEED] Creazione 30 utenti di test...");
  const passwordHash = await bcrypt.hash("test", 10);
  let created = 0;
  let skipped = 0;

  for (const tu of TEST_USERS) {
    const nickname = `user${tu.num}`;
    const email = `user${tu.num}@test.it`;
    const loc = VENETO_LOCATIONS[tu.num - 1];
    const birthYear = 1980 + (tu.num % 20);
    const jitterLat = (Math.random() - 0.5) * 0.02;
    const jitterLng = (Math.random() - 0.5) * 0.02;

    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const [user] = await db.insert(users).values({
      email,
      nickname,
      passwordHash,
      sex: tu.sex,
      birthYear,
      region: "Veneto",
      userType: tu.userType,
      coupleSexConfig: tu.coupleSexConfig,
      eulaAccepted: true,
    }).returning();

    await db.insert(userProfiles).values({
      userId: user.id,
      isAvailable: true,
      shareExactLocation: true,
      lastLatitude: loc.lat + jitterLat,
      lastLongitude: loc.lng + jitterLng,
      lastCity: loc.city,
      motorcycleType: tu.userType !== "zavorrina" ? "touring" : undefined,
      ridingStyle: tu.userType !== "zavorrina" ? "tranquilla" : undefined,
    });

    created++;
    console.log(`  [${created}] ${nickname} (${tu.userType}/${tu.sex}) @ ${loc.city}`);
  }

  console.log(`[SEED] Completato: ${created} creati, ${skipped} saltati (già esistenti)`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("[SEED] Errore:", err);
  process.exit(1);
});
