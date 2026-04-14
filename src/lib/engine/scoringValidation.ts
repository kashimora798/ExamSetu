import { supabase } from '../supabase';
import { trackError } from '../telemetry';

/**
 * Response from server-validated scoring RPC
 */
export interface ScoringValidationResult {
  valid: boolean;                    // TRUE if no tampering detected
  corrected_score: number;           // Server-recomputed score
  client_score: number;              // What client reported
  corrections: number;               // How many questions were corrected
  corrections_detail?: any[];        // Details of each correction (if tampering)
  message: string;                   // "OK" or error description
}

/**
 * validateSessionSubmit
 *
 * Call this on client before marking a session as completed.
 * This RPC recomputes the score server-side by comparing client's selected_option
 * against the authoritative correct_option from the questions table.
 *
 * Tampering Detection:
 * - Client marks wrong answer as correct
 * - Client marks correct answer as wrong
 * - Answer key mutation (very hard; requires compromised DB connection)
 * - Score inflation via direct DB tampering (detected via mismatch)
 *
 * Returns:
 * - valid=TRUE: Score is trustworthy, proceed with session submission
 * - valid=FALSE: Tampering detected, reject submission and log incident
 *
 * Usage:
 *   const result = await validateSessionSubmit(sessionId, userId);
 *   if (!result.valid) {
 *     throw new Error(`Tampering detected: ${result.message}`);
 *   }
 *   // Proceed with session completion
 */
export async function validateSessionSubmit(
  sessionId: string,
  userId: string
): Promise<ScoringValidationResult> {
  try {
    const { data, error } = await supabase.rpc('validate_session_submit', {
      p_session_id: sessionId,
      p_user_id: userId,
    });

    if (error) {
      console.error('[scoringValidation] RPC error:', error);
      await trackError(error, { stage: 'scoring_validation_rpc', session_id: sessionId }, userId);
      throw new Error(`Scoring validation failed: ${error.message}`);
    }

    const result = data as ScoringValidationResult;
    
    // Log any tampering detection
    if (!result.valid) {
      console.warn('[scoringValidation] Tampering detected:', {
        session_id: sessionId,
        user_id: userId,
        client_score: result.client_score,
        corrected_score: result.corrected_score,
        corrections: result.corrections,
        message: result.message,
      });

      await trackError(
        new Error(`Tampering Detected: ${result.message}`),
        {
          stage: 'tampering_detection',
          session_id: sessionId,
          client_score: result.client_score,
          corrected_score: result.corrected_score,
          corrections_count: result.corrections,
          corrections_detail: result.corrections_detail,
        },
        userId
      );
    }

    return result;
  } catch (error) {
    console.error('[scoringValidation] Exception:', error);
    await trackError(
      error,
      { stage: 'scoring_validation_exception', session_id: sessionId },
      userId
    );
    throw error;
  }
}

/**
 * formatScoringValidationError
 *
 * Convert validation errors into user-friendly messages
 */
export function formatScoringValidationError(result: ScoringValidationResult): string {
  if (result.valid) return '';
  
  if (result.corrections > 0) {
    if (result.corrections === 1) {
      return `⚠️ Security Check: 1 answer was corrected. Your score has been recalculated.`;
    } else {
      return `⚠️ Security Check: ${result.corrections} answers were corrected. Your score has been recalculated.`;
    }
  }
  
  return result.message || 'Unable to validate score. Please try again.';
}
