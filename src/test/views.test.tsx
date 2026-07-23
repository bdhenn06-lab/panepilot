// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { sampleParcels, scoreFixture } from './fixtures';
import { DEFAULT_SETTINGS, EMPTY_STATE, todayISO, type ProspectState } from '@/lib/scoring';
import type { ScoredParcel } from '@/components/workspace';

// ---- mocks -----------------------------------------------------------------

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/candidates',
}));

vi.mock('@/components/toast', () => ({
  useToast: () => vi.fn(),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const rows = sampleParcels();
const scored = scoreFixture(rows);
const states: Record<number, ProspectState> = {};
const markSent = vi.fn(() => ({ touch: 1, due: '2099-01-01' }));
const setState = vi.fn();
const toggleRouteStop = vi.fn();

function workspaceValue(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    loadError: '',
    orgId: 'org-1',
    org: { id: 'org-1', name: 'Whiteline', plan: 'trial', created_at: '' },
    role: 'owner',
    userEmail: 'test@whiteline.com',
    userId: 'u1',
    settings: DEFAULT_SETTINGS,
    parcels: rows,
    scored,
    byId: new Map(scored.map((x: ScoredParcel) => [x.id, x])),
    states,
    stateOf: (id: number) => states[id] ?? EMPTY_STATE,
    route: [] as number[],
    dueCount: 0,
    refresh: vi.fn(),
    saveSettings: vi.fn(),
    setState,
    markSent,
    toggleRouteStop,
    addRouteStops: vi.fn(),
    clearRoute: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

const mockWs = vi.fn(() => workspaceValue());
vi.mock('@/components/workspace', () => ({
  useWorkspace: () => mockWs(),
}));

import DashboardPage from '@/app/(app)/dashboard/page';
import CandidatesPage from '@/app/(app)/candidates/page';
import FollowUpsPage from '@/app/(app)/follow-ups/page';
import PortfoliosPage from '@/app/(app)/portfolios/page';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockWs.mockImplementation(() => workspaceValue());
});

// ---- dashboard -------------------------------------------------------------

describe('Dashboard', () => {
  it('shows KPIs computed from the fixture territory', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Commercial parcels')).toBeDefined();
    expect(screen.getAllByText(String(rows.length)).length).toBeGreaterThan(0);
    const gradeA = scored.filter((x) => x.score.grade === 'A').length;
    expect(screen.getAllByText(String(gradeA)).length).toBeGreaterThan(0);
    expect(screen.getByText('Acquisition funnel')).toBeDefined();
    expect(screen.getByText('Untouched')).toBeDefined();
  });

  it('splits the funnel by status and totals won value', () => {
    const t = todayISO();
    const custom: Record<number, ProspectState> = {
      [scored[0].id]: { ...EMPTY_STATE, status: 'Won', touch: 5 },
      [scored[1].id]: { ...EMPTY_STATE, status: 'Sequencing', touch: 2, due: t },
      [scored[2].id]: { ...EMPTY_STATE, status: 'Meeting', touch: 3 },
    };
    mockWs.mockImplementation(() => workspaceValue({ states: custom }));
    render(<DashboardPage />);
    expect(screen.getByText('1 follow-ups due')).toBeDefined();
    // Won value = scored[0] annual quarterly
    const won = Math.round(scored[0].est.annualQuarterly).toLocaleString('en-US');
    expect(screen.getByText(`$${won}`)).toBeDefined();
  });

  it('shows the empty state when no parcels are loaded', () => {
    mockWs.mockImplementation(() =>
      workspaceValue({ parcels: [], scored: [], byId: new Map() }),
    );
    render(<DashboardPage />);
    expect(screen.getByText('Workspace is empty')).toBeDefined();
  });
});

// ---- candidates ------------------------------------------------------------

describe('Candidates', () => {
  it('renders ranked prospects with grade badges and score breakdown on expand', () => {
    render(<CandidatesPage />);
    const top = scored[0];
    // Top-ranked address is on screen
    expect(screen.getAllByText(new RegExp(top.row.address)).length).toBeGreaterThan(0);
    // Expand the top card: the 5-factor breakdown appears
    fireEvent.click(screen.getAllByText(new RegExp(top.row.address))[0]);
    for (const label of ['Contract value', 'Building fit', 'Buyer signal', 'Portfolio', 'Route density']) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByText(/WHY THIS SCORE/)).toBeDefined();
    expect(screen.getByText(/TOUCH 1\/5/)).toBeDefined();
  });

  it('filters by grade', () => {
    render(<CandidatesPage />);
    const gradeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(gradeSelect, { target: { value: 'D' } });
    const dCount = scored.filter((x) => x.score.grade === 'D').length;
    expect(screen.getByText(new RegExp(`^${dCount} matches`))).toBeDefined();
  });

  it('mark sent advances the sequence via the workspace action', () => {
    render(<CandidatesPage />);
    fireEvent.click(screen.getAllByText(new RegExp(scored[0].row.address))[0]);
    fireEvent.click(screen.getByText('Mark sent'));
    expect(markSent).toHaveBeenCalledWith(scored[0].id);
  });

  it('status dropdown writes through setState', () => {
    render(<CandidatesPage />);
    fireEvent.click(screen.getAllByText(new RegExp(scored[0].row.address))[0]);
    const statusSelect = screen
      .getAllByRole('combobox')
      .find((el) => (el as HTMLSelectElement).value === '' && el.closest('label'));
    expect(statusSelect).toBeDefined();
    fireEvent.change(statusSelect!, { target: { value: 'Meeting' } });
    expect(setState).toHaveBeenCalledWith(scored[0].id, expect.objectContaining({ status: 'Meeting' }));
  });
});

// ---- follow-ups ------------------------------------------------------------

describe('Follow-ups', () => {
  it('splits due / upcoming / untouched correctly', () => {
    const t = todayISO();
    const custom: Record<number, ProspectState> = {
      [scored[0].id]: { ...EMPTY_STATE, status: 'Sequencing', touch: 1, due: t },
      [scored[1].id]: { ...EMPTY_STATE, status: 'Sequencing', touch: 2, due: '2099-12-31' },
      [scored[2].id]: { ...EMPTY_STATE, status: 'Won', touch: 5, due: t }, // excluded
    };
    mockWs.mockImplementation(() => workspaceValue({ states: custom }));
    render(<FollowUpsPage />);
    expect(screen.getByText('1 due now')).toBeDefined();
    expect(screen.getByText('Coming up')).toBeDefined();
    expect(screen.getByText('DUE')).toBeDefined();
    expect(screen.getByText('due 2099-12-31')).toBeDefined();
    expect(screen.getByText(/Start today/)).toBeDefined();
  });

  it('all caught up when nothing is due', () => {
    render(<FollowUpsPage />);
    expect(screen.getByText(/Nothing due/)).toBeDefined();
  });
});

// ---- portfolios ------------------------------------------------------------

describe('Portfolios', () => {
  it('groups multi-parcel owners and sums their potential', () => {
    render(<PortfoliosPage />);
    expect(screen.getByText(/owners hold 2\+ commercial parcels/)).toBeDefined();
    // Fixture guarantees repeated owners; at least one "N bldgs" chip renders.
    expect(screen.getAllByText(/\d+ bldgs/).length).toBeGreaterThan(0);
  });
});
