/**
 * Test smoke del modello Kalman (nessun framework, solo assert).
 * Verifica che una serie di scostamenti costanti converga a un bias stabile
 * con incertezza decrescente, e che l'API della libreria sia usata correttamente.
 *
 * Esecuzione:  node test-model.js
 */
const assert = require("assert");
const { step, normalizeAngleDiff } = require("./lib/kalman-model");

// ── Angle wrap ────────────────────────────────────────────────────────────────
assert.strictEqual(normalizeAngleDiff(350), -10, "350° deve normalizzare a -10°");
assert.strictEqual(normalizeAngleDiff(-350), 10, "-350° deve normalizzare a 10°");
assert.strictEqual(normalizeAngleDiff(10), 10);

// ── Convergenza: DR sovrastima costantemente la velocità di +3 m/s e l'heading di +12° ──
let state = null;
let last = null;
for (let i = 0; i < 40; i++) {
  const dr = { speed: 20 + 3, heading: 90 + 12 };
  const gps = { speed: 20, heading: 90 };
  const r = step(state, dr, gps, 8 /* m accuracy */);
  state = r.state;
  last = r.biases;
}

console.log("Bias stimati dopo 40 campioni:", JSON.stringify(last, null, 2));

assert(Math.abs(last.speedBias - 3) < 0.5, `speedBias ~3 atteso, ottenuto ${last.speedBias}`);
assert(Math.abs(last.headingBias - 12) < 2, `headingBias ~12 atteso, ottenuto ${last.headingBias}`);
assert(last.speedBiasStdDev < 1, `incertezza velocità deve calare, ottenuto ${last.speedBiasStdDev}`);
assert(last.headingBiasStdDev < 5, `incertezza heading deve calare, ottenuto ${last.headingBiasStdDev}`);

// ── Persistenza: lo stato deve essere serializzabile e ricaricabile ─────────────
const roundTrip = JSON.parse(JSON.stringify(state));
const r2 = step(roundTrip, { speed: 23, heading: 102 }, { speed: 20, heading: 90 }, 8);
assert(Array.isArray(r2.state.mean), "lo stato ricaricato da JSON deve produrre un nuovo step valido");

// ── Fix impreciso pesa meno (scale maggiore) ────────────────────────────────────
const good = step(null, { speed: 25, heading: 90 }, { speed: 20, heading: 90 }, 5);
const bad = step(null, { speed: 25, heading: 90 }, { speed: 20, heading: 90 }, 100);
assert(bad.accuracyScale > good.accuracyScale, "un fix impreciso deve avere accuracyScale maggiore");
assert(
  Math.abs(bad.biases.speedBias) < Math.abs(good.biases.speedBias),
  "con fix impreciso il filtro si sposta di meno al primo campione",
);

console.log("\n✅ Tutti i test del modello Kalman superati.");
