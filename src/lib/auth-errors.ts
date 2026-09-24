/** Turn Supabase auth errors into something an operator can act on. */
export function authErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('rate limit')) {
    return 'Too many attempts. Wait about a minute and try again.';
  }
  if (m.includes('is invalid') && m.includes('email')) {
    return 'That email was rejected. Use a regular address (some providers block + aliases).';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'An account with that email already exists. Sign in instead.';
  }
  return raw;
}
