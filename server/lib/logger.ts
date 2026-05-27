import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

const baseOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  base: { app: "bikerlink" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.sessionToken"],
    censor: "[REDACTED]",
  },
};

export const logger = isProd
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, singleLine: true, translateTime: "HH:MM:ss.l" },
      },
    });

export const matchingLogger = logger.child({ scope: "matching" });
export const schedulerLogger = logger.child({ scope: "scheduler" });
export const reportsLogger = logger.child({ scope: "reports" });
export const aiLogger = logger.child({ scope: "ai" });

export function childLogger(scope: string, extra?: Record<string, unknown>) {
  return logger.child({ scope, ...(extra ?? {}) });
}
