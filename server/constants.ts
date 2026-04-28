export const PROTECTED_NICKNAMES = ["BikerLink_Official"];

export function isProtectedUser(nickname: string): boolean {
  return PROTECTED_NICKNAMES.includes(nickname);
}

export const PROTECTED_EMAILS = [
  "applereview@bikerlink.it",
  "googlereview@bikerlink.it",
];
