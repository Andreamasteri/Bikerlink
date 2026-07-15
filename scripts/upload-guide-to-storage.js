#!/usr/bin/env node
/**
 * Upload script: carica le 13 card guida su object storage.
 * - Immagini su public/ads/ (servite via /api/ads/images/{filename})
 * - ZIP su public/guide/bikerlink-guida.zip
 * - Immagini disponibili su HTTP: /uploads/bikerlink-guida.zip
 *
 * Prerequisiti: immagini in attached_assets/guide/*.jpg (1080x1350px)
 * Eseguire con: node scripts/upload-guide-to-storage.js
 */

const { Client } = require("@replit/object-storage");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const client = new Client();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const GUIDE_DIR = path.resolve(__dirname, "../attached_assets/guide");
const ZIP_PATH = path.resolve(__dirname, "../uploads/bikerlink-guida.zip");

const CARDS = [
  { sort: 1, file: "01-fake-position.jpg" },
  { sort: 2, file: "02-garage-moto.jpg" },
  { sort: 3, file: "03-lastfm.jpg" },
  { sort: 4, file: "04-profilo.jpg" },
  { sort: 5, file: "05-mappa.jpg" },
  { sort: 6, file: "06-match.jpg" },
  { sort: 7, file: "07-ride.jpg" },
  { sort: 8, file: "08-chat.jpg" },
  { sort: 9, file: "09-motoclub.jpg" },
  { sort: 10, file: "10-tracking.jpg" },
  { sort: 11, file: "11-trip.jpg" },
  { sort: 12, file: "12-eventi.jpg" },
  { sort: 13, file: "13-music.jpg" },
];

async function buildZip() {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(ZIP_PATH);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
    archive.pipe(output);
    CARDS.forEach((c) => {
      const fp = path.join(GUIDE_DIR, c.file);
      if (fs.existsSync(fp)) archive.file(fp, { name: c.file });
    });
    archive.finalize();
  });
}

async function run() {
  console.log("=== BikerLink Guide Upload ===\n");

  // 1. Upload images to public/ads/
  console.log("1. Uploading images to object storage (public/ads/)...");
  const imageUrls = {};
  for (const c of CARDS) {
    const fp = path.join(GUIDE_DIR, c.file);
    if (!fs.existsSync(fp)) {
      console.warn(`  ⚠ Missing: ${c.file}`);
      continue;
    }
    const buf = fs.readFileSync(fp);
    // Deterministic filename — no timestamp, always overwrite
    const newName = `guide-${c.file}`;
    const objPath = `public/ads/${newName}`;
    const result = await client.uploadFromBytes(objPath, buf, {
      headers: { "Content-Type": "image/jpeg" },
    });
    if (result.ok) {
      imageUrls[c.sort] = `/api/ads/images/${newName}`;
      console.log(`  ✓ [${c.sort}] ${c.file} → ${objPath}`);
    } else {
      console.error(`  ✗ [${c.sort}] ${c.file}: ${result.error?.message}`);
    }
  }

  // 2. Build ZIP
  console.log("\n2. Building ZIP archive...");
  const zipSize = await buildZip();
  console.log(`  ✓ ZIP: ${ZIP_PATH} (${Math.round(zipSize / 1024)}KB)`);

  // 3. Upload ZIP to object storage
  console.log("\n3. Uploading ZIP to object storage (public/guide/)...");
  const zipBuf = fs.readFileSync(ZIP_PATH);
  const zipResult = await client.uploadFromBytes(
    "public/guide/bikerlink-guida.zip",
    zipBuf,
    { headers: { "Content-Type": "application/zip" } }
  );
  if (zipResult.ok) {
    console.log("  ✓ ZIP on object storage: public/guide/bikerlink-guida.zip");
    console.log(
      "  ✓ HTTP download URL: https://bikerlink.replit.app/uploads/bikerlink-guida.zip"
    );
  } else {
    console.error("  ✗ ZIP upload:", zipResult.error?.message);
  }

  // 4. Update campaign image URLs in DB
  console.log("\n4. Updating campaign image_url in DB...");
  let updated = 0;
  for (const [sort, imageUrl] of Object.entries(imageUrls)) {
    const result = await pool.query(
      "UPDATE ad_campaigns SET image_url=$1, image_version=image_version+1 WHERE sort_order=$2 AND name ILIKE $3 RETURNING id, name",
      [imageUrl, parseInt(sort), "Guida:%"]
    );
    if (result.rows.length > 0) {
      console.log(`  ✓ [${sort}] ${result.rows[0].name}`);
      updated++;
    }
  }
  console.log(`\n  Updated ${updated}/${CARDS.length} campaigns.`);
  console.log("\n=== Upload complete ===");
}

run()
  .catch((e) => {
    console.error("Fatal error:", e.message);
    process.exit(1);
  })
  .finally(() => pool.end());
