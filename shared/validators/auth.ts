import { z } from "zod";

// Nickname riservati per match ESATTO (invariato dal comportamento storico).
export const RESERVED_EXACT_NICKNAMES = [
  "admin",
  "administrator",
  "administrators",
  "amministratore",
  "amministratori",
  "mod",
  "moderator",
  "moderatore",
];

// Task #119 — nomi degli agenti AI interni (Ares, Nadir, Bowie, Quebracho,
// Horus). A differenza della lista sopra, questi vanno bloccati anche come
// SOTTOSTRINGA case-insensitive (es. "AresAdmin", "il_bowie99", "nadir@...")
// per impedire tentativi di impersonificazione/ingegneria sociale in chat,
// log e pannelli admin dove questi nomi sono riconoscibili.
// "quebracho" kept in reservation list to prevent username conflicts (Task #591).
export const RESERVED_AI_AGENT_NAMES = ["ares", "nadir", "bowie", "quebracho", "horus"];

/** True se il nickname è riservato (match esatto admin/mod, o contiene un nome di agente AI). */
export function isReservedNickname(nickname: string): boolean {
  const lower = nickname.trim().toLowerCase();
  if (!lower) return false;
  if (RESERVED_EXACT_NICKNAMES.includes(lower)) return true;
  return RESERVED_AI_AGENT_NAMES.some((name) => lower.includes(name));
}

/** True se la parte locale (prima della @) dell'email contiene un nome di agente AI. */
export function isReservedEmailLocalPart(email: string): boolean {
  const localPart = email.split("@")[0]?.trim().toLowerCase() ?? "";
  if (!localPart) return false;
  return RESERVED_AI_AGENT_NAMES.some((name) => localPart.includes(name));
}

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
  marketingAccepted: z.boolean().optional().default(false),
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


export const clientErrorReportSchema = z.object({
  message: z.string().max(2000).optional(),
  stack: z.string().max(5000).optional(),
  componentStack: z.string().max(2000).optional(),
  platform: z.string().max(50).optional(),
  appVersion: z.string().max(50).optional(),
});
export type ClientErrorReportInput = z.infer<typeof clientErrorReportSchema>;
