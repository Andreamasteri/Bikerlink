const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ORANGE = '#FF6B35';
const DARK_BLUE = '#1A1A2E';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F5F5F5';
const DARK_GRAY = '#333333';
const MID_GRAY = '#888888';
const GREEN = '#2ECC71';
const RED = '#E74C3C';
const YELLOW = '#F39C12';

const OUTPUT_DIR = path.join(__dirname, '..', 'server', 'public');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ASSETS_DIR = path.join(OUTPUT_DIR, 'assets');
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

const competitors = ['BikerLink', 'Calimoto', 'Kurviger', 'Wheelo', 'Motobit', 'Motoplanner'];

const comparisonData = [
  {
    feature: 'Routing curvy',
    values: ['✓ GraphHopper self-hosted', '✓ Proprietario su GH', '✓ GraphHopper', '✓ Google Maps', '✓ Proprietario OSM', '✗ Basic only'],
    checks: ['yes', 'yes', 'yes', 'yes', 'yes', 'no'],
  },
  {
    feature: 'Round trip automatico',
    values: ['✓', '✓', '✓ max 300km', '✗', '✓', '✗'],
    checks: ['yes', 'yes', 'partial', 'no', 'yes', 'no'],
  },
  {
    feature: 'AI linguaggio naturale',
    values: ['✓ Gemini Flash (gratis)', '✗', '✗', '✗', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'no', 'no', 'no'],
  },
  {
    feature: 'Meteo sul percorso',
    values: ['✓ Open-Meteo (gratis)', '✗', '✗', '✓ 5 giorni', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'partial', 'no', 'no'],
  },
  {
    feature: 'POI lungo percorso',
    values: ['✓ Overpass (gratis)', '~ Limitato', '✓', '✓', '~ Pagamento', '✓ Passi montagna'],
    checks: ['yes', 'partial', 'yes', 'yes', 'partial', 'partial'],
  },
  {
    feature: 'Giri multi-giorno',
    values: ['✓ Auto-suddivisione', '✗', '✗', '✗', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'no', 'no', 'no'],
  },
  {
    feature: 'Sensori lean angle',
    values: ['✓ già in app', '✗', '✗', '✗', '✓ Premium', '✗'],
    checks: ['yes', 'no', 'no', 'no', 'partial', 'no'],
  },
  {
    feature: 'Social matching',
    values: ['✓ Auto-match bikers', '✗', '✗', '✓ Base', '✗', '✗'],
    checks: ['yes', 'no', 'no', 'partial', 'no', 'no'],
  },
  {
    feature: 'GPX import/export',
    values: ['✓', '✓', '✓', '✓ Premium', '✓', '✓'],
    checks: ['yes', 'yes', 'yes', 'partial', 'yes', 'yes'],
  },
  {
    feature: 'Mappe offline',
    values: ['✓ PMTiles (gratis)', '✓', '✓ Premium', '✗', '✗', '✗'],
    checks: ['yes', 'yes', 'partial', 'no', 'no', 'no'],
  },
  {
    feature: 'CarPlay/Android Auto',
    values: ['→ Roadmap', '✓ Premium', '✓ Premium', '✗', '✓', '✗'],
    checks: ['partial', 'partial', 'partial', 'no', 'partial', 'no'],
  },
  {
    feature: 'BikerScore / curvy score',
    values: ['✓ BikerScore custom', '✓', '✗', '✗', '✗', '✗'],
    checks: ['yes', 'yes', 'no', 'no', 'no', 'no'],
  },
  {
    feature: 'Costo per utente',
    values: ['GRATIS', '€34.99/anno', '€30/anno', 'Freemium', '€29.99/anno', 'Freemium'],
    checks: ['yes', 'no', 'no', 'partial', 'no', 'partial'],
  },
  {
    feature: 'Costo infrastruttura',
    values: ['~€20/mese', 'Alto (segreto)', 'Alto', 'Alto', 'Alto', 'Medio'],
    checks: ['yes', 'no', 'no', 'no', 'no', 'partial'],
  },
];

const stackData = [
  { layer: 'Motore routing', choice: 'GraphHopper self-hosted', cost: '€0 (open source)' },
  { layer: 'Dati OSM', choice: 'Geofabrik download', cost: '€0 (open data)' },
  { layer: 'Profilo curvy', choice: 'motorcycle_curvy.json custom', cost: '€0' },
  { layer: 'AI linguaggio naturale', choice: 'Gemini 1.5 Flash', cost: '€0 (free tier)' },
  { layer: 'Mappe display', choice: 'OpenFreeMap + MapLibre GL', cost: '€0 (no key)' },
  { layer: 'Meteo', choice: 'Open-Meteo', cost: '€0 (no key)' },
  { layer: 'POI / hotel', choice: 'Overpass API (OSM)', cost: '€0 (no key)' },
  { layer: 'Geocoding', choice: 'Nominatim (OSM)', cost: '€0' },
  { layer: 'Hosting routing server', choice: 'Hetzner CPX41 (Europa)', cost: '~€20/mese' },
  { layer: 'TOTALE MENSILE', choice: '', cost: '~€20/mese' },
];

const differentiators = [
  { num: '01', title: 'AI in linguaggio naturale', desc: '"Portami su strade curvy verso il Lago di Garda con 3 ore di tempo" → percorso generato automaticamente con Gemini Flash.' },
  { num: '02', title: 'Auto-matching integrato', desc: 'Il giro pianificato trova automaticamente bikers nella zona con moto e preferenze compatibili.' },
  { num: '03', title: 'Sensori reali già integrati', desc: 'Lean angle, G-force, velocità curva già nell\'app → alimentano il curvy score reale, non simulato.' },
  { num: '04', title: 'Giri multi-giorno completi', desc: 'Suddivisione automatica tappe + hotel OSM + meteo tappa per tappa, tutto in un unico click.' },
  { num: '05', title: 'Livello carburante serbatoio', desc: 'Calcola le soste benzina in base al livello reale, non solo l\'autonomia teorica del modello.' },
  { num: '06', title: 'BikerScore proprietario', desc: 'Curvy score arricchito con dati reali dei giri registrati dagli utenti BikerLink, non solo geometria.' },
  { num: '07', title: 'Tutto gratis', desc: 'Nessun abbonamento per le funzioni base. Infrastruttura completa a ~€20/mese, non migliaia.' },
];

const part2 = require('./generate-competitor-analysis.part2.js');

async function main() {
  await part2.generatePDF({
    PDFDocument, sharp, fs, path,
    ORANGE, DARK_BLUE, WHITE, LIGHT_GRAY, DARK_GRAY, MID_GRAY, GREEN, RED, YELLOW,
    ASSETS_DIR, competitors, comparisonData, stackData, differentiators
  });
  await part2.generatePNG({
    sharp, path, ASSETS_DIR, ORANGE, DARK_BLUE, WHITE, LIGHT_GRAY, DARK_GRAY, MID_GRAY, GREEN, RED, YELLOW
  });
}

main().catch(console.error);
