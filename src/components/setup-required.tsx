import { IconWind } from '@/components/icons';
import { supabaseEnvProblems } from '@/lib/supabase/config';

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12.5px] bg-soft border border-line rounded px-1.5 py-0.5 text-ink2 break-all">
      {children}
    </code>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="num shrink-0 w-6 h-6 rounded-full bg-accent-soft text-accent-dark text-[11.5px] font-semibold grid place-items-center mt-0.5">
        {n}
      </span>
      <div className="flex-1">
        <p className="text-[13.5px] text-ink font-medium">{title}</p>
        {children && <div className="text-[13px] text-ink2 mt-1 flex flex-col gap-1">{children}</div>}
      </div>
    </li>
  );
}

/**
 * Shown in place of the app when no Supabase project is attached. A fresh clone
 * has no `.env.local`, and every route in this app reads the session, so without
 * this the whole site answers 500 with the SDK's "URL and Key are required"
 * message and no indication of what to do about it.
 */
export function SetupRequired() {
  const problems = supabaseEnvProblems();

  return (
    <main className="flex-1 p-6">
      <div className="max-w-xl mx-auto mt-12 mb-12">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center shrink-0">
            <IconWind />
          </div>
          <div>
            <p className="font-semibold text-base leading-tight">PanePilot</p>
            <p className="text-[11.5px] text-ink3">Setup required</p>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-xl p-5">
          <h1 className="text-[15px] font-semibold">Connect a Supabase project</h1>
          <p className="text-[13.5px] text-ink2 mt-1.5">
            The app is built and running — it just has no database or auth provider to talk to yet.
            PanePilot keeps every org&apos;s parcels, pipeline, and settings in Supabase, so it needs
            a project before any page can load.
          </p>

          {problems.length > 0 && (
            <div className="mt-4 rounded-lg border border-line bg-warn-soft/60 px-3.5 py-3">
              <p className="text-[12px] font-semibold text-warn uppercase tracking-wide">
                Environment
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {problems.map((p) => (
                  <li key={p.name} className="text-[13px] text-ink2">
                    <Code>{p.name}</Code> <span className="text-ink3">— {p.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="mt-5 flex flex-col gap-3.5">
            <Step n={1} title="Create a free Supabase project">
              <p>
                At <Code>supabase.com</Code> → New project. Any region; the free tier is enough.
              </p>
            </Step>
            <Step n={2} title="Run the migrations">
              <p>
                In the Supabase SQL Editor, paste and run each file in{' '}
                <Code>supabase/migrations/</Code> in filename order, starting with{' '}
                <Code>0001_init.sql</Code>. They create the tables, row-level security, and RPCs.
              </p>
            </Step>
            <Step n={3} title="Copy the keys into .env.local">
              <p>
                From the repo root: <Code>cp .env.example .env.local</Code>, then fill in the
                Project URL and the publishable/anon key from Supabase → Project Settings → API.
              </p>
            </Step>
            <Step n={4} title="Restart the dev server">
              <p>
                <Code>npm run dev</Code> — Next.js reads <Code>.env.local</Code> at startup, so the
                values are not picked up until it restarts. This page is replaced by the sign-in
                screen once both variables are valid.
              </p>
            </Step>
          </ol>

          <p className="text-xs text-ink3 mt-5 pt-4 border-t border-line">
            Full walkthrough, including deploying to Vercel and the optional Stripe and Resend
            integrations, is in <Code>README.md</Code>.
          </p>
        </div>
      </div>
    </main>
  );
}
