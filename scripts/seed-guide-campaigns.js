#!/usr/bin/env node
/**
 * Seed script: inserisce le 13 card guida come campagne nel DB.
 * Usato durante Task #847 — Guida utente BikerLink.
 * Eseguire con: node scripts/seed-guide-campaigns.js
 */

const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CAMPAIGNS = [
  {
    sort: 1,
    name: "Guida: Posizione Personalizzata",
    desc: "Scegli dove apparire sulla mappa. Esplora biker di un altra citta. Proteggi la tua posizione reale. Dove si trova: Profilo → Impostazioni → Posizione.",
    imageFile: "01-fake-position.jpg",
  },
  {
    sort: 2,
    name: "Guida: Aggiungi la Tua Moto",
    desc: "Senza moto = nessun match. Come aggiungere: 1. Vai al tab Profilo 2. Tocca Garage 3. Premi + Aggiungi Moto. Il sistema abbina per marca, modello e stile di guida.",
    imageFile: "02-garage-moto.jpg",
  },
  {
    sort: 3,
    name: "Guida: Collega Last.fm",
    desc: "BikerLink analizza la tua musica ascoltata. Match con biker dagli stessi gusti musicali. Come collegarlo: Profilo → Impostazioni → Collega Last.fm. Facoltativo ma migliora i match.",
    imageFile: "03-lastfm.jpg",
  },
  {
    sort: 4,
    name: "Guida: Il Tuo Profilo",
    desc: "Aggiungi foto profilo, indica il tipo (Biker/Zavorrina/Coppia), imposta la regione.",
    imageFile: "04-profilo.jpg",
  },
  {
    sort: 5,
    name: "Guida: Mappa Interattiva",
    desc: "Vedi biker disponibili vicino a te. Filtra per tipo e distanza. Aggiornamento in tempo reale.",
    imageFile: "05-mappa.jpg",
  },
  {
    sort: 6,
    name: "Guida: Sistema Match",
    desc: "Il sistema abbina per moto e gusti. Accetta o rifiuta le proposte. Chat diretta dopo il match.",
    imageFile: "06-match.jpg",
  },
  {
    sort: 7,
    name: "Guida: Ride! Disponibilita",
    desc: "Attiva per farti trovare dai biker vicini. La disponibilita scade automaticamente. Ricevi proposte di gita in tempo reale.",
    imageFile: "07-ride.jpg",
  },
  {
    sort: 8,
    name: "Guida: Chat e Messaggi",
    desc: "Messaggi privati con altri biker. Chat di gruppo nei motoclub. Notifiche in tempo reale.",
    imageFile: "08-chat.jpg",
  },
  {
    sort: 9,
    name: "Guida: Motoclub",
    desc: "Trova club nella tua zona. Iscriviti e partecipa alle chat di gruppo. Organizza uscite con il tuo club.",
    imageFile: "09-motoclub.jpg",
  },
  {
    sort: 10,
    name: "Guida: Performance Counter",
    desc: "Velocita GPS in tempo reale. Misura forza G (accelerazione e frenata). Salva e analizza le tue sessioni.",
    imageFile: "10-tracking.jpg",
  },
  {
    sort: 11,
    name: "Guida: Trip — Proposte Gita",
    desc: "Crea una proposta di gita. Scegli data, percorso e dettagli. Rispondi alle proposte degli altri biker.",
    imageFile: "11-trip.jpg",
  },
  {
    sort: 12,
    name: "Guida: Raduni ed Eventi",
    desc: "Scopri raduni e eventi in zona. Filtra per distanza e data. Partecipa con un tap.",
    imageFile: "12-eventi.jpg",
  },
  {
    sort: 13,
    name: "Guida: Music / Radio Biker",
    desc: "Radio integrata sempre disponibile. Player per la tua musica offline. Collega Last.fm per i match musicali.",
    imageFile: "13-music.jpg",
  },
];

async function seed() {
  console.log("Checking existing guide campaigns...");
  const existing = await pool.query(
    "SELECT sort_order, name, image_url FROM ad_campaigns WHERE name ILIKE 'Guida:%' ORDER BY sort_order"
  );
  console.log(`Found ${existing.rows.length} existing guide campaigns.`);

  for (const c of existing.rows) {
    console.log(
      `  [${c.sort_order}] ${c.name} → ${c.image_url?.substring(0, 60)}...`
    );
  }

  if (existing.rows.length === 13) {
    console.log("\nAll 13 guide campaigns already exist. Nothing to insert.");
    return;
  }

  console.log("\nInserting missing campaigns...");
  let inserted = 0;
  for (const c of CAMPAIGNS) {
    const exists = existing.rows.find((r) => r.sort_order === c.sort);
    if (exists) continue;

    // Images are uploaded to object storage at public/ads/ and served via /api/ads/images/
    // Run scripts/upload-guide-to-storage.js first to get the actual filenames
    const imageUrl = `/api/ads/images/guide1080-${c.imageFile}`;

    await pool.query(
      `INSERT INTO ad_campaigns 
       (name, sponsor, image_url, description, is_active, target_user_type, 
        rotation_duration, rotation_mode, sort_order, placement, display_mode)
       VALUES ($1, $2, $3, $4, true, 'tutti', 15, 'sequential', $5, 'all', 'banner')`,
      [c.name, "BikerLink Guide", imageUrl, c.desc, c.sort]
    );
    inserted++;
    console.log(`  ✓ Inserted [${c.sort}] ${c.name}`);
  }

  console.log(`\nDone. Inserted ${inserted} new campaigns.`);
}

seed()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
