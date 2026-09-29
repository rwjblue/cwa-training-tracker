/** Gravatar's avatar endpoint needs no API key or profile lookup. */
export async function gravatarUrl(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `https://gravatar.com/avatar/${hash}?s=80&d=404&r=g`;
}
