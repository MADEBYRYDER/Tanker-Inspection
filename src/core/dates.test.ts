import { describe, expect, it } from 'vitest';
import {
  addMonths,
  addYears,
  daysBetween,
  formatDate,
  isISODate,
  monthLabel,
  nextDateInMonths,
  relativeDayLabel,
  yearsBetween,
} from './dates';

describe('isISODate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true); // leap year
    expect(isISODate('2026-02-29')).toBe(false); // not a leap year
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('2026-04-31')).toBe(false);
    expect(isISODate('not-a-date')).toBe(false);
  });
});

describe('addMonths', () => {
  it('clamps to the end of a shorter target month', () => {
    // The bug this guards: Jan 31 + 1 month naively becomes Mar 3.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('rolls across year boundaries', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-02-15', -3)).toBe('2025-11-15');
  });

  it('handles the common maintenance intervals', () => {
    expect(addMonths('2026-08-29', 3)).toBe('2026-11-29');
    expect(addMonths('2026-08-29', 12)).toBe('2027-08-29');
    expect(addYears('2026-08-29', 3)).toBe('2029-08-29');
  });
});

describe('daysBetween / yearsBetween', () => {
  it('counts days inclusive of leap days', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2026-08-29', '2026-08-29')).toBe(0);
    expect(daysBetween('2026-08-29', '2026-08-01')).toBe(-28);
  });

  it('is not shifted by the host timezone', () => {
    // Parsing through local time makes this 364 or 366 west of UTC.
    expect(daysBetween('2025-08-29', '2026-08-29')).toBe(365);
  });

  it('measures years for equipment age', () => {
    expect(yearsBetween('2013-06-14', '2026-08-29')).toBeCloseTo(13.2, 1);
  });
});

describe('nextDateInMonths', () => {
  it('finds the next occurrence of a seasonal month', () => {
    expect(nextDateInMonths('2026-08-29', [9])).toBe('2026-09-01');
    expect(nextDateInMonths('2026-08-29', [3, 9])).toBe('2026-09-01');
  });

  it('rolls to next year when the season has passed', () => {
    expect(nextDateInMonths('2026-10-15', [3, 4])).toBe('2027-03-01');
  });

  it('does not return a date before the reference', () => {
    // September 1 is already behind us on September 15.
    expect(nextDateInMonths('2026-09-15', [9])).toBe('2027-09-01');
  });
});

describe('formatting', () => {
  it('renders human labels', () => {
    expect(formatDate('2026-09-04')).toBe('Sep 4, 2026');
    expect(monthLabel('2026-09-01')).toBe('September 2026');
  });

  it('describes relative time at the right granularity', () => {
    expect(relativeDayLabel('2026-08-29', '2026-08-29')).toBe('today');
    expect(relativeDayLabel('2026-08-29', '2026-09-01')).toBe('in 3 days');
    expect(relativeDayLabel('2026-08-29', '2026-08-24')).toBe('5 days ago');
    expect(relativeDayLabel('2026-08-29', '2026-10-29')).toBe('in 2 months');
    expect(relativeDayLabel('2026-08-29', '2024-08-29')).toBe('2 years ago');
  });
});
