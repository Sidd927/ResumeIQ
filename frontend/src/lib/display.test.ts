import { describe, expect, it } from 'vitest';

import type { MatchResponse } from '../types';
import { formatFileSize, formatMonthYear, formatRelativeTime } from './format';
import { getScoreBand } from './score';
import { contribution, SIGNALS, toPercent } from './signals';

describe('score bands (one threshold set drives colour AND wording)', () => {
  it.each([
    [100, 'strong'],
    [80, 'strong'],
    [79.9, 'good'],
    [60, 'good'],
    [59.9, 'moderate'],
    [40, 'moderate'],
    [39.9, 'weak'],
    [0, 'weak'],
  ])('%d → %s', (score, tone) => {
    expect(getScoreBand(score).tone).toBe(tone);
  });
});

describe('signals', () => {
  const match = {
    skill_score: 0.72,
    semantic_score: 0.81,
    recency_score: 0.65,
    completeness_score: 0.95,
  } as MatchResponse;

  it('weights sum to 1, mirroring the backend composite formula', () => {
    expect(SIGNALS.reduce((sum, s) => sum + s.weight, 0)).toBeCloseTo(1);
  });

  it('contributions add up to the composite', () => {
    const total = SIGNALS.reduce((sum, s) => sum + contribution(s, match), 0);
    expect(total).toBeCloseTo(75.6); // 28.8 + 24.3 + 13.0 + 9.5
  });

  it('converts sub-scores to whole percentages', () => {
    expect(toPercent(0.726)).toBe(73);
  });
});

describe('formatting', () => {
  const now = Date.parse('2026-09-28T12:00:00Z');

  it.each([
    ['2026-09-28T11:59:40Z', 'just now'],
    ['2026-09-28T11:55:00Z', '5 minutes ago'],
    ['2026-09-28T09:00:00Z', '3 hours ago'],
    ['2026-09-27T12:00:00Z', 'yesterday'],
    ['2026-09-07T12:00:00Z', '3 weeks ago'],
  ])('relative time %s → %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it('formats resume dates', () => {
    expect(formatMonthYear('2024-06')).toBe('Jun 2024');
    expect(formatMonthYear('2022')).toBe('2022');
    expect(formatMonthYear(null)).toBe('Present');
  });

  it('formats file sizes', () => {
    expect(formatFileSize(900)).toBe('900 B');
    expect(formatFileSize(248_000)).toBe('242 KB');
    expect(formatFileSize(1_300_000)).toBe('1.2 MB');
  });
});
