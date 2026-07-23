import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { IconWind } from '@/components/icons';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <main className="flex-1 grid place-items-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-accent text-white grid place-items-center mb-4">
          <IconWind width={24} height={24} />
        </div>
        <h1 className="text-2xl font-semibold">PanePilot</h1>
        <p className="text-ink2 mt-2 text-[13.5px]">
          Customer acquisition OS for commercial window cleaning. Turn county parcel records into a
          scored, routed, follow-up-driven pipeline.
        </p>
        <div className="flex gap-3 justify-center mt-6">
          <Link
            href="/signup"
            className="h-10 rounded-lg px-5 bg-accent text-white text-[13px] font-semibold inline-flex items-center hover:bg-accent-dark"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="h-10 rounded-lg px-5 border border-line2 bg-panel text-[13px] text-ink2 inline-flex items-center hover:bg-soft"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
