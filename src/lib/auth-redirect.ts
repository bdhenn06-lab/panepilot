export function authDestination(next: string | null, type: string | null): string {
  if (type === 'recovery') return '/update-password';
  // Restrict destinations to known application entry points.
  return next && ['/update-password', '/onboarding', '/dashboard'].includes(next)
    ? next : '/dashboard';
}
