import { IconWind } from '@/components/icons';

export function AuthCard({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 p-6">
      <div className="max-w-sm mx-auto mt-16">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center shrink-0">
            <IconWind />
          </div>
          <div>
            <p className="font-semibold text-base leading-tight">PanePilot</p>
            <p className="text-[11.5px] text-ink3">{subtitle}</p>
          </div>
        </div>
        <div className="bg-panel border border-line rounded-xl p-4">{children}</div>
      </div>
    </main>
  );
}
