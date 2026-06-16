import type { Request, Response, NextFunction } from "express";
import type express from "express";

export function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;

    console.error("[global-error-handler] unhandled error:", err);

    if (res.headersSent) {
      return next(err);
    }

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(status).json({ success: false, message: "Errore interno del server" });
  });
}
