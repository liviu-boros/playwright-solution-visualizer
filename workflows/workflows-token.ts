export function getAccessTokenForOrigin(
  state: Record<string, string>,
  origin: string,
): string {
  if (!origin) return 'anonymous-token';
  return state[origin] || `token-for-${origin.replace(/^https?:\/\//, '')}`;
}
