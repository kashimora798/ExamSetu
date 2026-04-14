export type ShareCardKind = 'score' | 'streak' | 'rank' | 'achievement' | 'subject';

export interface ShareMessageInput {
  kind: ShareCardKind;
  score?: number;
  correct?: number;
  total?: number;
  streak?: number;
  rank?: number | string;
  subjectName?: string;
  accuracy?: number;
  badge?: string;
  brand?: string;
}

function formatScoreLabel(score?: number, correct?: number, total?: number) {
  if (typeof score === 'number') return `${score}%`;
  if (typeof correct === 'number' && typeof total === 'number' && total > 0) {
    return `${Math.round((correct / total) * 100)}%`;
  }
  return 'great progress';
}

export function getShareMessage(input: ShareMessageInput): { title: string; text: string } {
  const brand = input.brand || 'ExamSetu';

  switch (input.kind) {
    case 'score': {
      const scoreLabel = formatScoreLabel(input.score, input.correct, input.total);
      const correctPart = typeof input.correct === 'number' && typeof input.total === 'number'
        ? ` (${input.correct}/${input.total})`
        : '';
      return {
        title: 'मेरा UPTET Score',
        text: `मैंने ${scoreLabel}${correctPart} score किया! 🎯 ${brand} पर practice कर रहा हूं. आप भी try करें.`,
      };
    }
    case 'streak':
      return {
        title: 'My Study Streak',
        text: `मैं ${input.streak || 0} दिन की streak पर हूं 🔥 ${brand} पर रोज़ practice जारी है.`,
      };
    case 'rank':
      return {
        title: 'Leaderboard Rank',
        text: `मैं leaderboard पर #${input.rank || '--'} पर हूं 🏆 ${brand} के साथ.`,
      };
    case 'achievement':
      return {
        title: 'Achievement Unlocked',
        text: `${input.badge || 'Achievement'} ✨ ${brand} पर मेरी learning journey का नया milestone.`,
      };
    case 'subject':
      return {
        title: 'Subject Progress',
        text: `${input.subjectName || 'इस subject'} में मेरी accuracy ${input.accuracy || 0}% है 📘 ${brand} के साथ consistent practice.`,
      };
    default:
      return {
        title: brand,
        text: `I’m learning with ${brand}.`,
      };
  }
}
