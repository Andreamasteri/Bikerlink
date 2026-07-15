/**
 * BikerLink — Kalman model per la stima del bias velocità/heading (DR vs GPS)
 *
 * Modello (random-walk / constant-position su stato 2D):
 *   stato  x_t = [ speedBias, headingBias ]           (dimension = 2)
 *   transizione F = I  (i bias derivano lentamente → random walk)
 *   osservazione H = I  (osserviamo direttamente lo scostamento DR-GPS,
 *                        che è il bias corrente + rumore di misura)
 *
 * L'osservazione fornita al filtro NON è la posizione, ma lo *scostamento*
 * fra la stima dead-reckoning e la misura GPS:
 *   z = [ drSpeed - gpsSpeed , angleDiff(drHeading, gpsHeading) ]
 *
 * La covarianza di osservazione R è scalata dall'accuratezza del fix GPS
 * (un fix impreciso pesa meno). La covarianza di processo Q è piccola: i
 * bias sono considerati quasi costanti nel tempo.
 *
 * Zero stato globale: ogni funzione è pura e opera su uno stato serializzabile
 * ({mean, covariance, index}), così il server puo' persistere per-utente.
 */

const { KalmanFilter, State } = require("kalman-filter");

// ── Parametri di default del modello (sovrascrivibili via env sul server) ──────
const DEFAULTS = {
  // Varianza iniziale (incertezza a priori sui bias) — grande = "non so nulla".
  initSpeedVar: 25, // (m/s)^2
  initHeadingVar: 900, // (deg)^2  (~30° di stddev iniziale)
  // Rumore di processo Q (quanto i bias possono derivare tra due campioni).
  procSpeedVar: 0.01, // (m/s)^2
  procHeadingVar: 0.25, // (deg)^2
  // Rumore di osservazione R alla precisione di riferimento del fix.
  obsSpeedVar: 4, // (m/s)^2
  obsHeadingVar: 100, // (deg)^2
  // Accuratezza di riferimento del fix GPS (m): a questa accuratezza R = obs*Var.
  refAccuracyM: 10,
  // Limiti di scaling per non far esplodere/annullare R con fix estremi.
  minAccuracyScale: 0.25,
  maxAccuracyScale: 25,
};

/** Normalizza una differenza angolare in gradi nell'intervallo (-180, 180]. */
function normalizeAngleDiff(deg) {
  let d = ((deg + 180) % 360) - 180;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Calcola l'osservazione (scostamento) da una coppia DR/GPS.
 * @returns {{ speedDeviation:number, headingDeviation:number }}
 */
function computeObservation(dr, gps) {
  const speedDeviation = Number(dr.speed) - Number(gps.speed);
  const headingDeviation = normalizeAngleDiff(Number(dr.heading) - Number(gps.heading));
  return { speedDeviation, headingDeviation };
}

/**
 * Fattore di scaling della covarianza di osservazione in base all'accuratezza
 * del fix (metri). accuracy grande → R grande → osservazione meno affidabile.
 */
function accuracyScale(accuracyM, cfg) {
  const acc = Number.isFinite(accuracyM) && accuracyM > 0 ? accuracyM : cfg.refAccuracyM;
  const raw = (acc / cfg.refAccuracyM) ** 2;
  return Math.min(cfg.maxAccuracyScale, Math.max(cfg.minAccuracyScale, raw));
}

/** Costruisce l'istanza KalmanFilter per un dato scaling di accuratezza. */
function buildFilter(cfg, scale) {
  return new KalmanFilter({
    observation: {
      dimension: 2,
      stateProjection: [
        [1, 0],
        [0, 1],
      ],
      covariance: [cfg.obsSpeedVar * scale, cfg.obsHeadingVar * scale],
    },
    dynamic: {
      dimension: 2,
      init: {
        mean: [[0], [0]],
        covariance: [
          [cfg.initSpeedVar, 0],
          [0, cfg.initHeadingVar],
        ],
      },
      transition: [
        [1, 0],
        [0, 1],
      ],
      covariance: [cfg.procSpeedVar, cfg.procHeadingVar],
    },
  });
}

/**
 * Esegue un passo predict+correct del filtro.
 *
 * @param {Object|null} prevState stato persistito {mean, covariance, index} o null (init)
 * @param {{speed:number,heading:number}} dr  stima dead reckoning
 * @param {{speed:number,heading:number}} gps misura GPS alla riacquisizione
 * @param {number} accuracyM accuratezza del fix GPS in metri
 * @param {Object} [cfgOverride] override parziale dei parametri del modello
 * @returns {{ state:Object, biases:Object, observation:Object }}
 */
function step(prevState, dr, gps, accuracyM, cfgOverride = {}) {
  const cfg = { ...DEFAULTS, ...cfgOverride };
  const obs = computeObservation(dr, gps);
  const scale = accuracyScale(accuracyM, cfg);
  const kf = buildFilter(cfg, scale);

  const previousCorrected =
    prevState && Array.isArray(prevState.mean)
      ? new State({
          mean: prevState.mean,
          covariance: prevState.covariance,
          index: typeof prevState.index === "number" ? prevState.index : 0,
        })
      : null;

  const predicted = kf.predict({ previousCorrected });
  const corrected = kf.correct({
    predicted,
    observation: [obs.speedDeviation, obs.headingDeviation],
  });

  const nextIndex = (previousCorrected ? previousCorrected.index : -1) + 1;

  const state = {
    mean: corrected.mean,
    covariance: corrected.covariance,
    index: nextIndex,
  };

  const speedBias = corrected.mean[0][0];
  const headingBias = corrected.mean[1][0];
  const speedVar = corrected.covariance[0][0];
  const headingVar = corrected.covariance[1][1];

  const biases = {
    speedBias,
    headingBias,
    speedBiasStdDev: Math.sqrt(Math.max(0, speedVar)),
    headingBiasStdDev: Math.sqrt(Math.max(0, headingVar)),
    speedBiasVariance: speedVar,
    headingBiasVariance: headingVar,
  };

  return { state, biases, observation: obs, accuracyScale: scale };
}

module.exports = {
  DEFAULTS,
  normalizeAngleDiff,
  computeObservation,
  accuracyScale,
  step,
};
