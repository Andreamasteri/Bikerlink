/**
 * Intento di un singolo tratto tra due waypoint.
 *
 * Il tipo resta indipendente dal provider: descrive ciò che il motociclista
 * vuole ottenere dal tratto, non quale motore debba calcolarlo.
 */
export const ROUTE_INTENT_KINDS = [
  "inherit",
  "urban_exit",
  "guided",
  "scenic",
  "transfer",
  "quick_return",
] as const;

export type RouteIntentKind = (typeof ROUTE_INTENT_KINDS)[number];
export type RouteIntentStyle = "direct" | "fast" | "balanced" | "curvy" | "extra_curvy";
export type RouteIntentDrivingProfile = "geometric" | "real" | "my_style";

export interface SegmentRouteIntent {
  /** `inherit` conserva tutte le impostazioni globali del giro. */
  kind?: RouteIntentKind;
  /** Override puntuale dello stile, prevale sul default del kind. */
  style?: RouteIntentStyle;
  /** Override puntuale dello strato telemetrico. */
  drivingProfile?: RouteIntentDrivingProfile;
  avoidHighways?: boolean;
  avoidTolls?: boolean;
  avoidFerries?: boolean;
  avoidUnpaved?: boolean;
  avoidWeather?: boolean;
}

export interface GlobalRouteIntent {
  style: RouteIntentStyle;
  drivingProfile: RouteIntentDrivingProfile;
  avoidHighways: boolean;
  avoidTolls: boolean;
  avoidFerries: boolean;
  avoidUnpaved: boolean;
  avoidWeather: boolean;
}

export interface ResolvedSegmentRouteIntent extends GlobalRouteIntent {
  kind: RouteIntentKind;
}

/**
 * Traduce gli intenti ad alto livello nei pesi già disponibili nel router.
 * `scenic` è volutamente una preferenza curvy geometrica finché la Fase 4 non
 * introdurrà uno scoring paesaggistico reale: non promette panorami inesistenti.
 */
const STYLE_BY_KIND: Partial<Record<RouteIntentKind, RouteIntentStyle>> = {
  urban_exit: "fast",
  guided: "curvy",
  scenic: "curvy",
  transfer: "fast",
  quick_return: "fast",
};

export function resolveSegmentRouteIntent(
  intent: SegmentRouteIntent | undefined,
  global: GlobalRouteIntent,
): ResolvedSegmentRouteIntent {
  const kind = intent?.kind ?? "inherit";
  return {
    kind,
    style: intent?.style ?? STYLE_BY_KIND[kind] ?? global.style,
    drivingProfile: intent?.drivingProfile ?? global.drivingProfile,
    avoidHighways: intent?.avoidHighways ?? global.avoidHighways,
    avoidTolls: intent?.avoidTolls ?? global.avoidTolls,
    avoidFerries: intent?.avoidFerries ?? global.avoidFerries,
    avoidUnpaved: intent?.avoidUnpaved ?? global.avoidUnpaved,
    avoidWeather: intent?.avoidWeather ?? global.avoidWeather,
  };
}
