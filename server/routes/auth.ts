import { Router, type Request, type Response } from "express";
import loginRouter from "./auth/login";
import registerRouter from "./auth/register";
import passwordRouter from "./auth/password";
import profileRouter from "./auth/profile";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    sessionType?: "mobile" | "web";
  }
}

const router = Router();

// Orchestrator for auth routes
router.use("/", loginRouter);
router.use("/", registerRouter);
router.use("/", passwordRouter);
router.use("/", profileRouter);

router.get("/email-configured", async (_req: Request, res: Response) => {
  // SMTP credentials live EXCLUSIVELY in environment secrets
  // (GMAIL_USER / GMAIL_APP_PASSWORD). No fallback al DB: i segreti non
  // risiedono più in app_settings (task #5086).
  const configured = !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  return res.json({ configured });
});

export { verifyEmailStore, resendVerificationStore, verifyAttempts, clearVerifyAttempts, VERIFY_EMAIL_WINDOW_MS, VERIFY_EMAIL_MAX, RESEND_VERIFICATION_WINDOW_MS, RESEND_VERIFICATION_MAX, VERIFY_MAX_ATTEMPTS, VERIFY_ATTEMPT_WINDOW_MS } from "./auth/register";

export default router;
