import { isSessionTypeGated } from './subscriptionValidation';

export function shouldPreflightGate(sessionType: string, isPro: boolean, isGrandfatheredFree: boolean): boolean {
  return isSessionTypeGated(sessionType) && !isPro && !isGrandfatheredFree;
}

export function getSessionTimeLimitSecs(sessionType: string, questionCount: number): number {
  if (sessionType === 'mock_test' || sessionType === 'pyq_paper') return 9000;
  if (sessionType === 'challenge') return 600;
  return questionCount * 75;
}
