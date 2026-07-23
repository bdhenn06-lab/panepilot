export function Loading({ label = 'Loading team workspace…' }: { label?: string }) {
  return <p className="text-[13px] text-ink2">{label}</p>;
}
