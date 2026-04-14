/**
 * Gamification: XP, Levels, Streaks — per plan specification
 */
import { supabase } from '../supabase';

// ─── XP Award Table (exact values from spec) ───────────────────────────────
export const XP_AWARDS = {
  question_attempted: 5,         // per question attempted
  correct_bonus: 3,              // bonus per correct answer
  wrong_with_explanation: 1,     // learning still counts
  mock_test_complete: 50,        // completing a full mock
  streak_7_day: 100,             // 7-day streak bonus
  first_time_correct_topic: 20,  // first time correct on a topic
  daily_challenge_complete: 30,  // completing daily challenge
} as const;

// ─── Level Thresholds (from plan) ──────────────────────────────────────────
export const LEVELS = [
  { level: 1, minXP: 0,    maxXP: 200,  label: 'नया छात्र',      emoji: '📚' },
  { level: 2, minXP: 200,  maxXP: 600,  label: 'मेहनती',         emoji: '✏️' },
  { level: 3, minXP: 600,  maxXP: 1500, label: 'होनहार',         emoji: '🌟' },
  { level: 4, minXP: 1500, maxXP: 3500, label: 'प्रतिभाशाली',    emoji: '🏆' },
  { level: 5, minXP: 3500, maxXP: Infinity, label: 'UPTET स्टार', emoji: '⭐' },
] as const;

export interface LevelInfo {
  level: number;
  label: string;
  emoji: string;
  currentXP: number;
  minXP: number;
  maxXP: number;
  progressPct: number;
  xpToNext: number | null;
}

export function getLevelInfo(totalXP: number): LevelInfo {
  const lvl = [...LEVELS].reverse().find(l => totalXP >= l.minXP) ?? LEVELS[0];
  const nextLvl = LEVELS.find(l => l.level === lvl.level + 1);
  const progressPct = nextLvl
    ? Math.min(100, ((totalXP - lvl.minXP) / (nextLvl.minXP - lvl.minXP)) * 100)
    : 100;
  return {
    level: lvl.level,
    label: lvl.label,
    emoji: lvl.emoji,
    currentXP: totalXP,
    minXP: lvl.minXP,
    maxXP: lvl.maxXP,
    progressPct,
    xpToNext: nextLvl ? nextLvl.minXP - totalXP : null,
  };
}

// ─── Calculate XP for a session ────────────────────────────────────────────
export interface SessionXPResult {
  total: number;
  breakdown: { label: string; xp: number }[];
}

export function calculateSessionXP(params: {
  attempted: number;
  correct: number;
  sessionType: string;
  isStreakMilestone?: boolean; // true if completing a 7-day streak
}): SessionXPResult {
  const breakdown: { label: string; xp: number }[] = [];

  const baseXP = params.attempted * XP_AWARDS.question_attempted;
  breakdown.push({ label: `${params.attempted} questions attempted`, xp: baseXP });

  const correctXP = params.correct * XP_AWARDS.correct_bonus;
  if (correctXP > 0) breakdown.push({ label: `${params.correct} correct answers`, xp: correctXP });

  const wrongXP = (params.attempted - params.correct) * XP_AWARDS.wrong_with_explanation;
  if (wrongXP > 0) breakdown.push({ label: 'Learning from wrong answers', xp: wrongXP });

  if (params.sessionType === 'mock_test') {
    breakdown.push({ label: 'Mock test completion bonus', xp: XP_AWARDS.mock_test_complete });
  }
  if (params.sessionType === 'challenge') {
    breakdown.push({ label: 'Daily challenge bonus', xp: XP_AWARDS.daily_challenge_complete });
  }
  if (params.isStreakMilestone) {
    breakdown.push({ label: '7-day streak bonus! 🔥', xp: XP_AWARDS.streak_7_day });
  }

  const total = breakdown.reduce((sum, b) => sum + b.xp, 0);
  return { total, breakdown };
}

// ─── Streak Logic ──────────────────────────────────────────────────────────
export interface StreakResult {
  nextStreak: number;
  isNewDay: boolean;
  isStreakBroken: boolean;
  isMilestone: boolean; // every 7 days
}

export function processStreakUpdate(
  lastActiveAt: string | null | undefined,
  currentStreak: number,
): StreakResult {
  if (!lastActiveAt) {
    return { nextStreak: 1, isNewDay: true, isStreakBroken: false, isMilestone: false };
  }

  const last = new Date(lastActiveAt);
  const now = new Date();
  
  // Compare calendar dates, not timestamps
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return { nextStreak: currentStreak, isNewDay: false, isStreakBroken: false, isMilestone: false };
  } else if (diffDays === 1) {
    const nextStreak = currentStreak + 1;
    const isMilestone = nextStreak % 7 === 0;
    return { nextStreak, isNewDay: true, isStreakBroken: false, isMilestone };
  } else {
    return { nextStreak: 1, isNewDay: true, isStreakBroken: true, isMilestone: false };
  }
}

// ─── Award XP to user in DB ────────────────────────────────────────────────
export async function awardXPToUser(userId: string, xpToAdd: number): Promise<{ newTotalXP: number } | null> {
  // Fetch current XP from user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('total_xp')
    .eq('id', userId)
    .single();
  
  const currentXP = (profile as any)?.total_xp || 0;
  const newTotalXP = currentXP + xpToAdd;
  
  await supabase
    .from('user_profiles')
    .update({ total_xp: newTotalXP })
    .eq('id', userId);
  
  return { newTotalXP };
}
