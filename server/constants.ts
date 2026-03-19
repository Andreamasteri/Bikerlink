export const PROTECTED_NICKNAMES = ["BikerLink_Official"];

export function isProtectedUser(nickname: string): boolean {
  return PROTECTED_NICKNAMES.includes(nickname);
}
