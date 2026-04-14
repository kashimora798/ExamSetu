import { supabase } from './supabase';
import { trackError, trackEvent } from './telemetry';

export type QuestionReportType =
  | 'typo'
  | 'wrong_answer'
  | 'wrong_explanation'
  | 'translation_issue'
  | 'other';

export type QuestionReportSource = 'practice_session' | 'practice_results' | 'mock_results';

export interface SubmitQuestionReportInput {
  userId: string;
  questionId: string;
  reportType: QuestionReportType;
  reportText?: string;
  source: QuestionReportSource;
  sessionId?: string;
}

export async function submitQuestionReport(input: SubmitQuestionReportInput) {
  const payload = {
    user_id: input.userId,
    question_id: input.questionId,
    report_type: input.reportType,
    report_text: input.reportText || null,
    source: input.source,
    session_id: input.sessionId || null,
  };

  const { data, error } = await supabase
    .from('questions_reports')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    await trackError(error, {
      stage: 'question_report_submit',
      question_id: input.questionId,
      report_type: input.reportType,
      source: input.source,
    }, input.userId);
    throw error;
  }

  void trackEvent('question_report_submit', {
    question_id: input.questionId,
    report_type: input.reportType,
    source: input.source,
    report_id: data?.id,
  }, input.userId);

  return data;
}
