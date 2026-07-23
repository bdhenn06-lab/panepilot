import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { Grade } from '@/lib/scoring';

export function Button({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`h-10 rounded-lg px-4 bg-accent text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer hover:bg-accent-dark disabled:opacity-50 disabled:cursor-default ${className}`}
      {...props}
    />
  );
}

export function Ghost({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`h-8 rounded-lg px-3 border border-line2 bg-panel text-xs text-ink2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap hover:bg-soft hover:text-ink disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

export function GhostLink({
  className = '',
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={`h-8 rounded-lg px-3 border border-line2 bg-panel text-xs text-ink2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap hover:bg-soft hover:text-ink no-underline ${className}`}
      {...props}
    >
      {children}
    </a>
  );
}

export function Input({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-line2 bg-panel px-3 text-[13.5px] text-ink outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft ${className}`}
      {...props}
    />
  );
}

export function Card({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`bg-panel border border-line rounded-xl px-4 py-3.5 ${className}`}>
      {children}
    </div>
  );
}

const GRADE_STYLES: Record<Grade, string> = {
  A: 'bg-good-soft text-good',
  B: 'bg-accent-soft text-accent-dark',
  C: 'bg-warn-soft text-warn',
  D: 'bg-soft text-ink3',
};

export function GradeBadge({
  grade,
  size = 'md',
  label,
}: {
  grade: Grade;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const dims = size === 'sm' ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-[12.5px]';
  return (
    <span
      className={`inline-grid place-items-center rounded-lg font-bold shrink-0 ${label ? 'w-auto px-2.5 text-xs h-7' : dims} ${GRADE_STYLES[grade]}`}
    >
      {label ?? grade}
    </span>
  );
}

export function ScoreBar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`score-bar ${className}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  valueClass = '',
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-panel border border-line rounded-xl px-3.5 py-3">
      <b className="block text-[11px] font-medium text-ink3">{label}</b>
      <span className={`text-[21px] font-semibold tabular-nums ${valueClass}`}>{value}</span>
      {hint ? <em className="not-italic text-[11px] text-ink3"> {hint}</em> : null}
    </div>
  );
}

export function Callout({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'bad';
  children: ReactNode;
}) {
  const styles =
    tone === 'ok'
      ? 'bg-good-soft text-good'
      : tone === 'warn'
        ? 'bg-warn-soft text-warn'
        : 'bg-bad-soft text-bad';
  return <div className={`rounded-lg px-3.5 py-2.5 text-[12.5px] mt-2.5 ${styles}`}>{children}</div>;
}
