import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import type { Question, QuestionAttempt, PracticeSession } from '../lib/types';
import { useNavigate } from 'react-router-dom';

export function usePractice() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Create a new practice session
  const startSession = async (filters: any) => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch questions that match the filters (limit based on filters.questionCount)
      let query = supabase.from('questions').select('*').limit(filters.questionCount || 30);
      
      if (filters.subject) {
        // Need to join subjects to get by code, or pass subject_id in filters
        const { data: subjectData } = await supabase.from('subjects').select('id').eq('code', filters.subject).single();
        if (subjectData) {
          query = query.eq('subject_id', subjectData.id);
        }
      }

      if (filters.chapterId) query = query.eq('chapter_id', filters.chapterId);
      if (filters.topicId) query = query.eq('topic_id', filters.topicId);
      if (filters.year) query = query.eq('source_year', filters.year);

      const { data: questions, error: qError } = await query;

      if (qError) throw qError;
      if (!questions || questions.length === 0) {
        throw new Error('No questions found matching these filters.');
      }

      // 2. Create the practice session
      const sessionType = filters.sessionType === 'weak_mix' ? 'custom' : (filters.sessionType || 'topic_practice');
      const cleanFilters = Object.fromEntries(Object.entries({ ...filters, practiceMode: filters.sessionType || sessionType }).filter(([, v]) => v !== '' && v !== null && v !== undefined));
      const { data: session, error: sError } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: user.id,
          session_type: sessionType,
          filters: cleanFilters,
          total_questions: questions.length,
          time_limit_secs: filters.isTimed ? (filters.timeLimitMins || 30) * 60 : null,
          status: 'in_progress',
          attempted: 0,
          correct: 0,
          wrong: 0,
          skipped: 0
        })
        .select()
        .single();

      if (sError) throw sError;

      // 3. Insert question attempts
      const attempts = questions.map((q, index) => ({
        session_id: session.id,
        user_id: user.id,
        question_id: q.id,
        question_order: index + 1,
        is_skipped: false,
        is_marked: false,
      }));

      const { error: aError } = await supabase.from('question_attempts').insert(attempts);
      
      if (aError) throw aError;

      // 4. Navigate to the session page
      navigate(`/practice/${session.id}`);
      
    } catch (err: any) {
      console.error('Error starting session:', err);
      setError(err.message || 'Failed to start session.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch full session details
  const fetchSessionData = useCallback(async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data: session, error: sError } = await supabase
        .from('practice_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
        
      if (sError) throw sError;

      const { data: attempts, error: aError } = await supabase
        .from('question_attempts')
        .select('*, questions(*)')
        .eq('session_id', sessionId)
        .order('question_order', { ascending: true });

      if (aError) throw aError;

      return { session, attempts };
    } catch (err: any) {
      console.error('Error fetching session:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Update a specific answer
  const submitAnswer = async (
    attemptId: string, 
    selectedOption: string, 
    isCorrect: boolean, 
    timeTaken: number
  ) => {
    try {
      const { error } = await supabase
        .from('question_attempts')
        .update({
          selected_option: selectedOption,
          is_correct: isCorrect,
          time_taken_secs: timeTaken,
          attempted_at: new Date().toISOString()
        })
        .eq('id', attemptId);
        
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error saving answer:', err);
      return false;
    }
  };

  const markForReview = async (attemptId: string, isMarked: boolean) => {
    try {
      await supabase.from('question_attempts').update({ is_marked: isMarked }).eq('id', attemptId);
    } catch (err) {
      console.error('Error marking question:', err);
    }
  };

  const finishSession = async (sessionId: string, finalMetrics: any) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('practice_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          time_taken_secs: finalMetrics.timeTakenSecs,
          attempted: finalMetrics.attempted,
          correct: finalMetrics.correct,
          wrong: finalMetrics.wrong,
          skipped: finalMetrics.skipped,
          score: finalMetrics.score
        })
        .eq('id', sessionId);
        
      if (error) throw error;
      navigate(`/results/${sessionId}`);
    } catch (err: any) {
      console.error('Error finishing session:', err);
      setError('Failed to submit test');
    } finally {
      setLoading(false);
    }
  };

  return {
    startSession,
    fetchSessionData,
    submitAnswer,
    markForReview,
    finishSession,
    loading,
    error
  };
}
