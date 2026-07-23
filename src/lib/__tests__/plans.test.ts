import { describe, expect, it } from 'vitest';
import { seatLimit, seatLimitLabel, seatsAvailable } from '../plans';

describe('plan seat limits', () => {
  it('maps each plan to its seat allowance', () => {
    expect(seatLimit('solo')).toBe(1);
    expect(seatLimit('crew')).toBe(5);
    expect(seatLimit('trial')).toBe(2);
    expect(seatLimit('franchise')).toBeGreaterThanOrEqual(999999);
  });

  it('seatsAvailable gates on used vs limit', () => {
    expect(seatsAvailable('solo', 0)).toBe(true);
    expect(seatsAvailable('solo', 1)).toBe(false);
    expect(seatsAvailable('crew', 4)).toBe(true);
    expect(seatsAvailable('crew', 5)).toBe(false);
    expect(seatsAvailable('franchise', 1000)).toBe(true);
  });

  it('labels the allowance for the UI', () => {
    expect(seatLimitLabel('solo')).toBe('1 seat');
    expect(seatLimitLabel('crew')).toBe('5 seats');
    expect(seatLimitLabel('franchise')).toBe('Unlimited seats');
  });
});
