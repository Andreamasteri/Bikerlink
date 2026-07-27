/**
 * Database selection is environment-specific and intentionally fail-closed.
 * Staging must never inherit DATABASE_URL from production.
 */
export type BikerLinkDeployEnvironment = "development" | "staging" | "production";

function resolveDeployEnvironment(): BikerLinkDeployEnvironment {
  const value = process.env.BIKERLINK_DEPLOY_ENV?.trim().toLowerCase();
  if (!value) return "development";
  if (value === "development" || value === "staging" || value === "production") {
    return value;
  }
  throw new Error(
    `BIKERLINK_DEPLOY_ENV non valido: "${value}". Valori ammessi: development, staging, production.`,
  );
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} deve essere configurato per questo ambiente.`);
  return value;
}

export function getDatabaseUrlForRuntime(): string {
  switch (resolveDeployEnvironment()) {
    case "staging":
      // No fallback: a missing candidate URL must stop the staging backend rather
      // than silently connecting to a generic/production DATABASE_URL.
      return required("DATABASE_URL_CANDIDATE");
    case "production":
      return required("DATABASE_URL");
    case "development":
      return process.env.DATABASE_URL_DEV?.trim() || required("DATABASE_URL");
  }
}
