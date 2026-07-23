import { describe, expect, it } from 'vitest';
import { EMPTY_STATE, MAX_TOUCHES, TOUCHES, advanceTouch, isDue } from '../cadence';
import { addDays } from '../format';

describe('outreach cadence', () => {
  it('cumulative send days are 1, 3, 6, 10, 14', () => {
    let day = 1;
    const days = TOUCHES.map((t, i) => (i === 0 ? day : (day += t.dayGap)));
    expect(days).toEqual([1, 3, 6, 10, 14]);
  });

  it('walks the full sequence with correct due dates', () => {
    let state = { ...EMPTY_STATE };
    let today = '2026-07-01';
    const dues: string[] = [];
    for (let i = 0; i < MAX_TOUCHES; i++) {
      const next = advanceTouch(state, today)!;
      expect(next).not.toBeNull();
      expect(next.touch).toBe(i + 1);
      expect(next.lastTouch).toBe(today);
      dues.push(next.due);
      state = next;
      if (next.due) today = next.due; // work the queue on the due day
    }
    expect(dues).toEqual([
      '2026-07-03', // +2
      '2026-07-06', // +3
      '2026-07-10', // +4
      '2026-07-14', // +4
      '', // sequence complete
    ]);
    expect(state.status).toBe('Sequencing');
    expect(advanceTouch(state, today)).toBeNull(); // no touch 6
  });

  it('does not demote an advanced pipeline status back to Sequencing', () => {
    const meeting = advanceTouch({ ...EMPTY_STATE, status: 'Meeting', touch: 2 }, '2026-07-01')!;
    expect(meeting.status).toBe('Meeting');
    const fresh = advanceTouch({ ...EMPTY_STATE }, '2026-07-01')!;
    expect(fresh.status).toBe('Sequencing');
  });

  it('isDue: only untouched/sequencing prospects with a passed due date', () => {
    const t = '2026-07-10';
    expect(isDue({ ...EMPTY_STATE, due: '2026-07-10', status: 'Sequencing' }, t)).toBe(true);
    expect(isDue({ ...EMPTY_STATE, due: '2026-07-09', status: '' }, t)).toBe(true);
    expect(isDue({ ...EMPTY_STATE, due: '2026-07-11', status: 'Sequencing' }, t)).toBe(false);
    expect(isDue({ ...EMPTY_STATE, due: '2026-07-01', status: 'Won' }, t)).toBe(false);
    expect(isDue({ ...EMPTY_STATE, due: '2026-07-01', status: 'Meeting' }, t)).toBe(false);
    expect(isDue({ ...EMPTY_STATE, due: '', status: 'Sequencing' }, t)).toBe(false);
    expect(isDue(undefined, t)).toBe(false);
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 4)).toBe('2027-01-03');
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01');
  });
});
