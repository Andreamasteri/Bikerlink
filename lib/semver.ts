export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const [aMaj = 0, aMin = 0, aPatch = 0] = parse(a);
  const [bMaj = 0, bMin = 0, bPatch = 0] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

export type UpdateOutcome = "ok" | "soft" | "force";

export function evaluateUpdateOutcome(
  installed: string,
  minVersion: string,
  latestVersion: string,
): UpdateOutcome {
  if (compareSemver(installed, minVersion) < 0) return "force";
  if (compareSemver(installed, latestVersion) < 0) return "soft";
  return "ok";
}
