import { describe, expect, it, vi, beforeEach } from 'vitest';

const { rpcMock, trackErrorMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  trackErrorMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../supabase', () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

vi.mock('../../telemetry', () => ({
  trackError: trackErrorMock,
}));

import { getShareMessage } from '../../shareMessages';
import { validateSessionSubmit, formatScoringValidationError } from '../scoringValidation';
import { validateSubscriptionForSession, isSessionTypeGated, formatSubscriptionError } from '../subscriptionValidation';
import { shouldPreflightGate, getSessionTimeLimitSecs } from '../sessionPolicy';

describe('share message generation', () => {
  it('formats score messages with derived percentage', () => {
    const message = getShareMessage({ kind: 'score', correct: 12, total: 15, brand: 'ExamSetu' });
    expect(message.title).toBe('मेरा UPTET Score');
    expect(message.text).toContain('80%');
    expect(message.text).toContain('(12/15)');
  });

  it('formats streak and rank messages', () => {
    expect(getShareMessage({ kind: 'streak', streak: 3 }).text).toContain('3 दिन');
    expect(getShareMessage({ kind: 'rank', rank: 1 }).text).toContain('#1');
  });
});

describe('session policy', () => {
  it('gates only pro-only session types', () => {
    expect(isSessionTypeGated('mock_test')).toBe(true);
    expect(isSessionTypeGated('pyq_paper')).toBe(true);
    expect(isSessionTypeGated('topic_practice')).toBe(false);
  });

  it('preflights gated modes for non-pro users', () => {
    expect(shouldPreflightGate('mock_test', false, false)).toBe(true);
    expect(shouldPreflightGate('mock_test', true, false)).toBe(false);
    expect(shouldPreflightGate('mock_test', false, true)).toBe(false);
  });

  it('computes consistent time limits', () => {
    expect(getSessionTimeLimitSecs('mock_test', 150)).toBe(9000);
    expect(getSessionTimeLimitSecs('pyq_paper', 150)).toBe(9000);
    expect(getSessionTimeLimitSecs('challenge', 10)).toBe(600);
    expect(getSessionTimeLimitSecs('topic_practice', 20)).toBe(1500);
  });
});

describe('subscription validation', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    trackErrorMock.mockClear();
  });

  it('allows free session types without subscription', async () => {
    rpcMock.mockResolvedValueOnce({ data: { allowed: true, reason: 'OK', subscription_status: 'none' }, error: null });
    await expect(validateSubscriptionForSession('user-1', 'topic_practice')).resolves.toMatchObject({ allowed: true });
  });

  it('blocks gated session types without active pro', async () => {
    rpcMock.mockResolvedValueOnce({ data: { allowed: false, reason: 'Upgrade required', subscription_status: 'none' }, error: null });
    const result = await validateSubscriptionForSession('user-1', 'mock_test');
    expect(result.allowed).toBe(false);
    expect(formatSubscriptionError(result)).toBe('Upgrade required');
  });

  it('surfaces rpc failures through trackError', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } });
    await expect(validateSubscriptionForSession('user-1', 'mock_test')).rejects.toThrow('Subscription validation failed');
    expect(trackErrorMock).toHaveBeenCalled();
  });
});

describe('scoring validation', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    trackErrorMock.mockClear();
  });

  it('accepts validated submissions from rpc', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { valid: true, corrected_score: 13, client_score: 13, corrections: 0, message: 'OK' },
      error: null,
    });
    await expect(validateSessionSubmit('session-1', 'user-1')).resolves.toMatchObject({ valid: true, corrected_score: 13 });
  });

  it('formats tamper detection messages', () => {
    expect(formatScoringValidationError({ valid: false, corrected_score: 12, client_score: 15, corrections: 1, message: 'tampering' }))
      .toContain('1 answer was corrected');
    expect(formatScoringValidationError({ valid: false, corrected_score: 12, client_score: 15, corrections: 3, message: 'tampering' }))
      .toContain('3 answers were corrected');
  });

  it('logs rpc errors before throwing', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'rpc failed' } });
    await expect(validateSessionSubmit('session-1', 'user-1')).rejects.toThrow('Scoring validation failed');
    expect(trackErrorMock).toHaveBeenCalled();
  });
});
