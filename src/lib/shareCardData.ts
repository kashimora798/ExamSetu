export interface ScoreShareData {
  score: number;
  correct: number;
  total: number;
  accuracy: number;
  sessionType: string;
  grade?: string;
}

export interface StreakShareData {
  streak: number;
  sessionsToday?: number;
  accuracy?: number;
}

export interface RankShareData {
  rank: number;
  accuracy: number;
  context?: string;
}

export interface AchievementShareData {
  badge: string;
  detail?: string;
}

export interface SubjectShareData {
  subjectName: string;
  accuracy: number;
  attempts?: number;
}
