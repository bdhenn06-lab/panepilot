import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import type { Grade } from '@/lib/scoring';

export function Button({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`h-10 rounded-lg px-4 bg-accent text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 disabled:cursor-default ${className}`}
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
      className={`h-8 rounded-lg px-3 border border-line2 bg-panel text-xs font-medium text-ink2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors hover:bg-soft hover:text-ink hover:border-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-45 ${className}`}
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
      className={`h-8 rounded-lg px-3 border border-line2 bg-panel text-xs font-medium text-ink2 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap no-underline transition-colors hover:bg-soft hover:text-ink hover:border-ink3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
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
      className={`h-10 w-full rounded-lg border border-line2 bg-panel px-3 text-[13.5px] text-ink outline-none transition-shadow placeholder:text-ink3 focus:border-accent focus:ring-[3px] focus:ring-accent-soft ${className}`}
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

/** Section heading — one consistent treatment instead of ad-hoc sizes per page. */
export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-end gap-3 flex-wrap mb-4">
      <div className="min-w-0">
        <h1 className="text-[19px] font-semibold tracking-tight leading-tight">{title}</h1>
        {sub ? <p className="text-[12.5px] text-ink2 mt-0.5">{sub}</p> : null}
      </div>
      {children ? <div className="ml-auto flex items-center gap-2 flex-wrap">{children}</div> : null}
    </div>
  );
}

const GRADE_STYLES: Record<Grade, string> = {
  A: 'bg-good text-white',
  B: 'bg-accent text-white',
  C: 'bg-warn-soft text-warn border border-warn/25',
  D: 'bg-soft text-ink3 border border-line2',
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
  // A and B carry solid fills so the buildings worth calling read first in a
  // long list; C and D stay quiet rather than competing for the same attention.
  const dims = size === 'sm' ? 'w-6 h-6 text-[11px]' : 'w-8 h-8 text-[13px]';
  return (
    <span
      className={`num inline-grid place-items-center rounded-lg font-semibold shrink-0 ${
        label ? 'w-auto px-2.5 text-xs h-7' : dims
      } ${GRADE_STYLES[grade]}`}
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
    <div className="bg-panel border border-line rounded-xl px-4 py-3.5">
      <b className="block text-[11px] font-medium uppercase tracking-[0.06em] text-ink3">
        {label}
      </b>
      <span className={`num block text-[26px] font-semibold leading-tight mt-1 ${valueClass}`}>
        {value}
      </span>
      {hint ? <em className="not-italic text-[11.5px] text-ink3">{hint}</em> : null}
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
      ? 'bg-good-soft text-good border-good/20'
      : tone === 'warn'
        ? 'bg-warn-soft text-warn border-warn/20'
        : 'bg-bad-soft text-bad border-bad/20';
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-[12.5px] mt-2.5 ${styles}`}>
      {children}
    </div>
  );
}
