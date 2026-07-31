import { describe, expect, it } from 'vitest';
import { computeCalibration, MIN_OUTCOMES_FOR_CALIBRATION, type JobOutcome } from '../feedback';

const outcome = (over: Partial<JobOutcome> = {}): JobOutcome => ({
  landUse: 'Office',
  estimatedPrice: 500,
  actualPrice: 500,
  estimatedHours: 4,
  actualHours: 4,
  ...over,
});

/**
 * Calibration is deliberately narrow: it corrects a systematic bias in the
 * estimator per building type (real jobs run 20% over quote for offices), it
 * does not try to recover a building's true size. A single wild outcome must
 * not be able to send future prices to zero or triple them.
 */
describe('computeCalibration', () => {
  it('needs a minimum sample before touching a use class', () => {
    const outcomes = Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION - 1 }, () =>
      outcome({ actualPrice: 1000 }), // 2x every estimate, but too few to trust
    );
    expect(computeCalibration(outcomes).priceMultiplier.office).toBeUndefined();
  });

  it('applies once enough outcomes agree', () => {
    const outcomes = Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
      outcome({ estimatedPrice: 500, actualPrice: 600 }),
    );
    expect(computeCalibration(outcomes).priceMultiplier.office).toBeCloseTo(1.2, 5);
  });

  it('uses the median so one outlier does not swing the whole class', () => {
    const outcomes = [
      outcome({ estimatedPrice: 500, actualPrice: 500 }),
      outcome({ estimatedPrice: 500, actualPrice: 550 }),
      outcome({ estimatedPrice: 500, actualPrice: 5000 }), // fat-fingered
      outcome({ estimatedPrice: 500, actualPrice: 500 }),
      outcome({ estimatedPrice: 500, actualPrice: 550 }),
    ];
    // Median ratio is 1.1 (from the 550s), not dragged toward the 10x outlier.
    expect(computeCalibration(outcomes).priceMultiplier.office).toBeCloseTo(1.1, 5);
  });

  it('clamps extreme ratios rather than trusting bad data outright', () => {
    const outcomes = Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
      outcome({ estimatedPrice: 100, actualPrice: 10000 }), // a genuine 100x data-entry error
    );
    expect(computeCalibration(outcomes).priceMultiplier.office).toBeLessThanOrEqual(2);
  });

  it('keeps different building types separate', () => {
    const cal = computeCalibration([
      ...Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
        outcome({ landUse: 'Office', estimatedPrice: 500, actualPrice: 600 }),
      ),
      ...Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
        outcome({ landUse: 'Warehouse', estimatedPrice: 500, actualPrice: 400 }),
      ),
    ]);
    expect(cal.priceMultiplier.office).toBeCloseTo(1.2, 5);
    expect(cal.priceMultiplier.industrial).toBeCloseTo(0.8, 5);
  });

  it('calibrates hours the same way, independent of price', () => {
    const outcomes = Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
      outcome({ estimatedHours: 4, actualHours: 5, estimatedPrice: 500, actualPrice: 500 }),
    );
    const cal = computeCalibration(outcomes);
    expect(cal.hoursMultiplier.office).toBeCloseTo(1.25, 5);
    expect(cal.priceMultiplier.office).toBeCloseTo(1, 5);
  });

  it('skips hours calibration for outcomes with no hours logged', () => {
    const outcomes = Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
      outcome({ estimatedHours: undefined, actualHours: undefined }),
    );
    expect(computeCalibration(outcomes).hoursMultiplier.office).toBeUndefined();
  });

  it('ignores an outcome with no usable estimate to compare against', () => {
    const outcomes = Array.from({ length: MIN_OUTCOMES_FOR_CALIBRATION }, () =>
      outcome({ estimatedPrice: 0, actualPrice: 500 }),
    );
    expect(computeCalibration(outcomes).priceMultiplier.office).toBeUndefined();
  });

  it('returns empty maps for no data', () => {
    expect(computeCalibration([])).toEqual({ priceMultiplier: {}, hoursMultiplier: {} });
  });
});
