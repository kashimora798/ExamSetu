import { supabase } from '../supabase';
import { trackError } from '../telemetry';

/**
 * Response from subscription validation RPC
 */
export interface SubscriptionValidationResult {
  allowed: boolean;                      // Can user access this session type?
  reason: string;                        // "OK" or explanation message
  subscription_status: 'active' | 'expired' | 'cancelled' | 'paused' | 'none';
  expires_at?: string;                   // When subscription expires (ISO timestamp)
}

/**
 * validateSubscriptionForSession
 *
 * Call this BEFORE starting a session to check if user has access to that session type.
 * Prevents: Free user from accessing Pro-only features (mock_test, pyq_paper)
 *
 * Gated session types (require Pro):
 *   - 'mock_test': Full mock test with timed mode
 *   - 'pyq_paper': Past year question papers with exam conditions
 *
 * Free session types:
 *   - 'topic_practice', 'revision', 'challenge', 'custom'
 *
 * Usage:
 *   const result = await validateSubscriptionForSession(userId, 'mock_test');
 *   if (!result.allowed) {
 *     showUpgradePrompt(result.reason);
 *     return;
 *   }
 *   // Proceed with session creation
 */
export async function validateSubscriptionForSession(
  userId: string,
  sessionType: string
): Promise<SubscriptionValidationResult> {
  try {
    const { data, error } = await supabase.rpc('validate_subscription', {
      p_user_id: userId,
      p_session_type: sessionType,
    });

    if (error) {
      console.error('[subscriptionValidation] RPC error:', error);
      await trackError(error, { stage: 'subscription_validation_rpc', session_type: sessionType }, userId);
      throw new Error(`Subscription validation failed: ${error.message}`);
    }

    const result = data as SubscriptionValidationResult;
    
    // Log any access denials for analytics
    if (!result.allowed) {
      console.warn('[subscriptionValidation] Access denied:', {
        user_id: userId,
        session_type: sessionType,
        subscription_status: result.subscription_status,
        reason: result.reason,
      });
    }

    return result;
  } catch (error) {
    console.error('[subscriptionValidation] Exception:', error);
    await trackError(
      error,
      { stage: 'subscription_validation_exception', session_type: sessionType },
      userId
    );
    throw error;
  }
}

/**
 * isSessionTypeGated
 *
 * Helper to check if a session type requires Pro subscription on the client side.
 * Useful for early UI decisions (e.g., show lock icon on session type).
 */
export function isSessionTypeGated(sessionType: string): boolean {
  return ['mock_test', 'pyq_paper'].includes(sessionType);
}

/**
 * formatSubscriptionError
 *
 * Convert validation errors into user-friendly messages
 */
export function formatSubscriptionError(result: SubscriptionValidationResult): string {
  if (result.allowed) return '';
  return result.reason || 'Access denied. Please upgrade your subscription.';
}
