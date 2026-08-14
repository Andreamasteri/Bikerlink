/**
 * Database selection is environment-specific and intentionally fail-closed.
 *
 * The three runtime targets are deliberately explicit:
 * - development -> DATABASE_URL_DEV
 * - staging     -> DATABASE_URL_CANDIDATE
 * - production  -> DATABASE_URL_PRODUCTION
 *
 * Generic DATABASE_URL is not accepted here. A missing or ambiguous target must
 * stop the process before a pool can be created.
 */
export type BikerLinkDeployEnvironment = "development" | "staging" | "production";

const URL_ENV_BY_DEPLOY_ENV: Record<BikerLinkDeployEnvironment, string> = {
  development: "DATABASE_URL_DEV",
  staging: "DATABASE_URL_CANDIDATE",
  production: "DATABASE_URL_PRODUCTION",
};

export function getDeployEnvironment(): BikerLinkDeployEnvironment {
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
  const environment = getDeployEnvironment();
  return required(URL_ENV_BY_DEPLOY_ENV[environment]);
}

export function getProductionDatabaseUrl(): string {
  if (getDeployEnvironment() !== "production") {
    throw new Error("Operazione consentita esclusivamente in production.");
  }
  return required("DATABASE_URL_PRODUCTION");
}
