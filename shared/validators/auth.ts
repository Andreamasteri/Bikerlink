import { z } from "zod";

export const registerSchema = z.object({
  nickname: z.string().min(3).max(50),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
    .regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola")
    .regex(/[0-9]/, "La password deve contenere almeno un numero"),
  userType: z.enum(["biker", "zavorrina", "coppia"]),
  sex: z.enum(["M", "F"]).optional(),
  coupleSexConfig: z.enum(["M+M", "M+F", "F+F"]).optional(),
  birthYear: z.number().int().min(1940).max(2010).optional(),
  region: z.string().max(100).optional(),
  country: z.string().max(2).optional(),
  eulaAccepted: z.literal(true, {
    message: "Devi accettare i termini di utilizzo",
  }),
  invitationCode: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(1, "Inserisci email o nickname"),
  password: z.string().min(1, "Inserisci la password"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  platform: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otaStuckEventSchema = z.object({
  deviceId: z.string().max(64).optional(),
  rollbackCount: z.number().int().min(0).max(1000).optional(),
  stuckSessions: z.number().int().min(0).optional(),
  runtimeVersion: z
    .string()
    .max(32)
    .regex(/^\d+\.\d+\.\d+$/, "runtimeVersion deve essere semver (es. 8.0.0)")
    .optional(),
});
export type OtaStuckEventInput = z.infer<typeof otaStuckEventSchema>;

export const clientErrorReportSchema = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(5000).optional(),
  componentStack: z.string().max(2000).optional(),
  platform: z.string().max(50).optional(),
  appVersion: z.string().max(50).optional(),
});
export type ClientErrorReportInput = z.infer<typeof clientErrorReportSchema>;
