import { describe, expect, it, vi, beforeEach } from 'vitest';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../../supabase', () => ({
  supabase: {
    from: fromMock,
  },
}));

import { fetchQuestionsForSession } from '../questionSelector';

function makeChain(responses: Array<{ data: any; error: any }>) {
  const chain: any = {
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    not() { return chain; },
    order() { return chain; },
    limit() { return Promise.resolve(responses.shift() ?? { data: [], error: null }); },
  };
  return chain;
}

describe('question selector', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('returns pyq questions in legacy order', async () => {
    fromMock.mockReturnValue(makeChain([
      { data: [
        { id: 'q-2', legacy_id: 'B', is_active: true },
        { id: 'q-1', legacy_id: 'A', is_active: true },
      ], error: null },
    ]));

    const questions = await fetchQuestionsForSession('pyq_paper', 'user-1', { limit: 2, sourceYear: 2019, paperNumber: 1 });
    expect(questions.map((q: any) => q.id)).toEqual(['q-2', 'q-1']);
    expect(fromMock).toHaveBeenCalledWith('questions');
  });

  it('returns a limited question set for mock_test subject mode', async () => {
    const pool = Array.from({ length: 20 }, (_, idx) => ({ id: `q-${idx + 1}`, is_active: true, subject_id: 'sub-1' }));
    fromMock.mockReturnValue(makeChain([
      { data: pool, error: null },
    ]));

    const questions = await fetchQuestionsForSession('mock_test', 'user-1', { subjectId: 'sub-1', limit: 10 });
    expect(questions).toHaveLength(10);
    expect(new Set(questions.map((q: any) => q.id)).size).toBeLessThanOrEqual(10);
  });
});
