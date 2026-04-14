/**
 * Adaptive Difficulty — adjusts mid-session every 5 questions silently
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

interface AdaptiveState {
  recentAnswers: boolean[]; // last 5 answers (true=correct, false=wrong)
  currentBias: 'easier' | 'mixed' | 'harder';
}

export function getAdaptiveBias(recentAnswers: boolean[]): 'easier' | 'mixed' | 'harder' {
  if (recentAnswers.length < 5) return 'mixed';
  
  const last5 = recentAnswers.slice(-5);
  const accuracy = last5.filter(Boolean).length / 5;

  if (accuracy > 0.8) return 'harder';  // doing great → push harder
  if (accuracy < 0.4) return 'easier'; // struggling → ease up
  return 'mixed';
}

/**
 * Returns a difficulty weight for question selection.
 * Higher weight = more likely to be selected.
 */
export function getDifficultyWeights(bias: 'easier' | 'mixed' | 'harder'): Record<Difficulty, number> {
  switch (bias) {
    case 'easier': return { easy: 60, medium: 30, hard: 10 };
    case 'harder': return { easy: 10, medium: 40, hard: 50 };
    default:       return { easy: 30, medium: 45, hard: 25 };
  }
}

/**
 * Given a sorted list of questions (by difficulty), pick the next N
 * according to adaptive bias.
 */
export function pickAdaptiveQuestions<T extends { difficulty: string }>(
  questions: T[],
  bias: 'easier' | 'mixed' | 'harder',
  count: number,
): T[] {
  const weights = getDifficultyWeights(bias);
  const buckets: Record<string, T[]> = { easy: [], medium: [], hard: [] };
  questions.forEach(q => {
    const d = q.difficulty as Difficulty;
    if (buckets[d]) buckets[d].push(q);
  });

  const total = count;
  const easyCount = Math.round((weights.easy / 100) * total);
  const hardCount = Math.round((weights.hard / 100) * total);
  const medCount = total - easyCount - hardCount;

  const pick = (arr: T[], n: number) => arr.slice(0, Math.min(n, arr.length));

  return [
    ...pick(buckets.easy, easyCount),
    ...pick(buckets.medium, medCount),
    ...pick(buckets.hard, hardCount),
  ];
}
