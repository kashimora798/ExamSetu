/**
 * Spaced Repetition System based on SM-2 Algorithm
 */

export interface SRSCard {
  id?: string;
  user_id: string;
  question_id: string;
  interval: number;
  repetition: number;
  efactor: number;
  next_review_date: string;
}

/**
 * SuperMemo 2 Algorithm step
 * 
 * Quality mapping:
 * 5 - Perfect response (correct & fast)
 * 4 - Correct response after a hesitation (correct & medium)
 * 3 - Correct response recalled with serious difficulty (correct & slow)
 * 2 - Incorrect response; where the correct one seemed easy to recall
 * 1 - Incorrect response; the correct one remembered
 * 0 - Complete blackout
 * 
 * In our boolean case we map:
 * Correct & <15s -> 5
 * Correct & <30s -> 4
 * Correct & >30s -> 3
 * Incorrect -> 1
 */
export function calculateNextReview(
  card: Partial<SRSCard> | null, 
  isCorrect: boolean, 
  timeTakenSecs: number, 
  userId: string, 
  questionId: string
): Omit<SRSCard, 'id'> {
  let quality = isCorrect ? (timeTakenSecs < 15 ? 5 : (timeTakenSecs < 30 ? 4 : 3)) : 1;
  
  let efactor = card?.efactor ?? 2.5;
  let interval = card?.interval ?? 0;
  let repetition = card?.repetition ?? 0;
  
  if (quality >= 3) {
    // Correct response
    if (repetition === 0) {
      interval = 1;
    } else if (repetition === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * efactor);
    }
    repetition++;
  } else {
    // Incorrect response
    repetition = 0;
    interval = 1;
  }
  
  // Update efactor
  efactor = efactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (efactor < 1.3) efactor = 1.3;
  
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  
  return {
    user_id: userId,
    question_id: questionId,
    interval,
    repetition,
    efactor,
    next_review_date: nextDate.toISOString()
  };
}
