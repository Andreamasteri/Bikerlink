export const PROTECTED_NICKNAMES = ["BikerLink_Official"];

export function isProtectedUser(nickname: string): boolean {
  return PROTECTED_NICKNAMES.includes(nickname);
}

export const PROTECTED_EMAILS = [
  "applereview@bikerlink.it",
  "googlereview@bikerlink.it",
];

export function isProtectedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PROTECTED_EMAILS.includes(email.toLowerCase());
}
