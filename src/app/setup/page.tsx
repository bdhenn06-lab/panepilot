import type { Metadata } from 'next';
import { SetupRequired } from '@/components/setup-required';

export const metadata: Metadata = {
  title: 'Setup required — PanePilot',
};

/**
 * Where the proxy sends every page request while no Supabase project is
 * attached. Deliberately the one route that touches neither the database nor
 * the session, so it can still render when nothing else can.
 */
export default function SetupPage() {
  return <SetupRequired />;
}
