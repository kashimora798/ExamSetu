import { describe, expect, it } from 'vitest';
import { shouldPreflightGate, getSessionTimeLimitSecs } from '../sessionPolicy';

describe('session policy helpers', () => {
  it('matches the launch gating rules', () => {
    expect(shouldPreflightGate('mock_test', false, false)).toBe(true);
    expect(shouldPreflightGate('pyq_paper', false, true)).toBe(false);
    expect(shouldPreflightGate('topic_practice', false, false)).toBe(false);
  });

  it('returns stable time limits for every mode', () => {
    expect(getSessionTimeLimitSecs('mock_test', 150)).toBe(9000);
    expect(getSessionTimeLimitSecs('pyq_paper', 150)).toBe(9000);
    expect(getSessionTimeLimitSecs('challenge', 10)).toBe(600);
    expect(getSessionTimeLimitSecs('revision', 12)).toBe(900);
  });
});
