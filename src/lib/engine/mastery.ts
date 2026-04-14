/**
 * Mastery level mappings and calculations for Topics
 */

export type MasteryLevel = 'not_started' | 'learning' | 'familiar' | 'proficient' | 'mastered';

export interface TopicStat {
  total_attempts: number;
  correct_attempts: number;
  accuracy: number;
  last_attempted_at?: string;
}

export function calculateMastery(stats: TopicStat | null): MasteryLevel {
  if (!stats || stats.total_attempts === 0) return 'not_started';
  
  const { accuracy, total_attempts } = stats;
  
  if (total_attempts < 5) {
    return 'learning'; // Not enough data
  }
  
  if (accuracy >= 85 && total_attempts >= 20) {
    return 'mastered';
  } else if (accuracy >= 70 && total_attempts >= 10) {
    return 'proficient';
  } else if (accuracy >= 50) {
    return 'familiar';
  } else {
    return 'learning';
  }
}

export function getMasteryColor(level: MasteryLevel): string {
  switch (level) {
    case 'mastered': return 'text-emerald-500 bg-emerald-50';
    case 'proficient': return 'text-blue-500 bg-blue-50';
    case 'familiar': return 'text-yellow-500 bg-yellow-50';
    case 'learning': return 'text-orange-500 bg-orange-50';
    case 'not_started': return 'text-gray-400 bg-gray-50';
  }
}
