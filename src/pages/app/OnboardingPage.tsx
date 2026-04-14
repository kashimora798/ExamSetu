import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ArrowLeft, User, Briefcase,
  BookOpen, FileText, MessageCircle, CheckCircle, Sparkles,
  GraduationCap, BookOpenCheck, Megaphone, Users, Globe,
  Play, Camera, Share2, Newspaper,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { Exam, ExamPaper } from '../../lib/types';
import './OnboardingPage.css';

/* ── Step config ── */
const TOTAL_STEPS = 6;

const professions = [
  { id: 'student', icon: GraduationCap, label: 'Student', labelHi: 'छात्र/छात्रा' },
  { id: 'teacher', icon: BookOpenCheck, label: 'Teacher', labelHi: 'शिक्षक' },
  { id: 'working', icon: Briefcase, label: 'Working Professional', labelHi: 'कार्यरत पेशेवर' },
  { id: 'homemaker', icon: Users, label: 'Homemaker', labelHi: 'गृहिणी' },
  { id: 'other', icon: Globe, label: 'Other', labelHi: 'अन्य' },
];

const sources = [
  { id: 'youtube', icon: Play, label: 'YouTube' },
  { id: 'whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { id: 'instagram', icon: Camera, label: 'Instagram' },
  { id: 'friend', icon: Share2, label: 'Friend / दोस्त' },
  { id: 'google', icon: Globe, label: 'Google Search' },
  { id: 'newspaper', icon: Newspaper, label: 'News / Blog' },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();

  /* Multi-step state */
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [saving, setSaving] = useState(false);

  /* Form data */
  const [fullName, setFullName] = useState('');
  const [profession, setProfession] = useState('');
  const [source, setSource] = useState('');
  const [examId, setExamId] = useState('');
  const [paperNum, setPaperNum] = useState<number | null>(null);
  const [phone, setPhone] = useState('');

  /* DB data */
  const [exams, setExams] = useState<Exam[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loadingExams, setLoadingExams] = useState(true);

  /* Fetch exams on mount */
  useEffect(() => {
    async function fetchExams() {
      const { data } = await supabase
        .from('exams')
        .select('*')
        .eq('is_active', true)
        .order('code');
      if (data) setExams(data as Exam[]);
      setLoadingExams(false);
    }
    fetchExams();
  }, []);

  /* Fetch papers when exam changes */
  useEffect(() => {
    if (!examId) { setPapers([]); return; }
    async function fetchPapers() {
      const { data } = await supabase
        .from('exam_papers')
        .select('*')
        .eq('exam_id', examId)
        .order('paper_number');
      if (data) setPapers(data as ExamPaper[]);
    }
    fetchPapers();
  }, [examId]);

  /* Pre-fill name from Google auth */
  useEffect(() => {
    if (user?.user_metadata?.full_name && !fullName) {
      setFullName(user.user_metadata.full_name);
    }
  }, [user]);

  /* Navigation */
  function goNext() {
    if (step < TOTAL_STEPS) {
      setDirection('forward');
      setStep(step + 1);
    }
  }

  function goBack() {
    if (step > 1) {
      setDirection('backward');
      setStep(step - 1);
    }
  }

  /* Can proceed? */
  function canProceed(): boolean {
    switch (step) {
      case 1: return fullName.trim().length >= 2;
      case 2: return profession !== '';
      case 3: return source !== '';
      case 4: return examId !== '';
      case 5: return paperNum !== null;
      case 6: return true; // phone is optional
      default: return false;
    }
  }

  /* Final submit */
  const handleComplete = useCallback(async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('user_profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        target_exam_id: examId,
        target_paper: paperNum,
        onboarding_done: true,
      })
      .eq('id', user.id);

    if (!error) {
      await refreshProfile();
      setDirection('forward');
      setStep(TOTAL_STEPS + 1); // Show celebration
      setTimeout(() => navigate('/dashboard'), 2500);
    }
    setSaving(false);
  }, [user, fullName, phone, examId, paperNum, refreshProfile, navigate]);

  /* ── Step rendering ── */
  const selectedExam = exams.find((e) => e.id === examId);

  return (
    <div className="onboarding-page" id="onboarding-page">
      {/* Background decoration */}
      <div className="onboard-bg-blob onboard-bg-blob-1" />
      <div className="onboard-bg-blob onboard-bg-blob-2" />
      <div className="onboard-bg-blob onboard-bg-blob-3" />

      <div className="onboard-container">
        {/* Logo */}
        <div className="onboard-logo">
          <div className="onboard-logo-icon">
            <BookOpen size={20} strokeWidth={2.5} />
          </div>
          <span lang="hi">शिक्षासेतु</span>
        </div>

        {/* Progress bar */}
        {step <= TOTAL_STEPS && (
          <div className="onboard-progress">
            <div className="onboard-progress-bar">
              <div
                className="onboard-progress-fill"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
            <span className="onboard-progress-text">
              {step} / {TOTAL_STEPS}
            </span>
          </div>
        )}

        {/* Steps */}
        <div className={`onboard-step-wrapper onboard-${direction}`} key={step}>

          {/* ── Step 1: Name ── */}
          {step === 1 && (
            <div className="onboard-step">
              <div className="onboard-step-emoji">👋</div>
              <h2 lang="hi">नमस्ते! आपका नाम क्या है?</h2>
              <p className="onboard-step-sub">
                Let's personalize your UPTET preparation journey
              </p>
              <div className="onboard-input-group">
                <User size={20} className="onboard-input-icon" />
                <input
                  id="onboard-name"
                  type="text"
                  className="onboard-input"
                  placeholder="आपका पूरा नाम"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && canProceed() && goNext()}
                />
              </div>
            </div>
          )}

          {/* ── Step 2: Profession ── */}
          {step === 2 && (
            <div className="onboard-step">
              <div className="onboard-step-emoji">💼</div>
              <h2 lang="hi">आप क्या करते हैं?</h2>
              <p className="onboard-step-sub">
                This helps us customize your experience
              </p>
              <div className="onboard-options-grid">
                {professions.map((p) => (
                  <button
                    key={p.id}
                    className={`onboard-option-card ${profession === p.id ? 'selected' : ''}`}
                    onClick={() => setProfession(p.id)}
                    id={`profession-${p.id}`}
                  >
                    <p.icon size={24} />
                    <span className="onboard-option-label">{p.label}</span>
                    <span className="onboard-option-label-hi" lang="hi">{p.labelHi}</span>
                    {profession === p.id && (
                      <CheckCircle size={18} className="onboard-option-check" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Source ── */}
          {step === 3 && (
            <div className="onboard-step">
              <div className="onboard-step-emoji">📢</div>
              <h2 lang="hi">हमारे बारे में कैसे पता चला?</h2>
              <p className="onboard-step-sub">
                Help us reach more UPTET aspirants like you
              </p>
              <div className="onboard-options-grid onboard-options-3col">
                {sources.map((s) => (
                  <button
                    key={s.id}
                    className={`onboard-option-card ${source === s.id ? 'selected' : ''}`}
                    onClick={() => setSource(s.id)}
                    id={`source-${s.id}`}
                  >
                    <s.icon size={22} />
                    <span className="onboard-option-label">{s.label}</span>
                    {source === s.id && (
                      <CheckCircle size={18} className="onboard-option-check" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 4: Exam Selection ── */}
          {step === 4 && (
            <div className="onboard-step">
              <div className="onboard-step-emoji">📝</div>
              <h2 lang="hi">किस परीक्षा की तैयारी कर रहे हैं?</h2>
              <p className="onboard-step-sub">
                Select the exam you're preparing for
              </p>
              {loadingExams ? (
                <div className="onboard-loading">
                  <div className="auth-loading-spinner" />
                  <span lang="hi">Exams load हो रहे हैं...</span>
                </div>
              ) : (
                <div className="onboard-options-grid onboard-options-exam">
                  {exams.map((exam) => (
                    <button
                      key={exam.id}
                      className={`onboard-exam-card ${examId === exam.id ? 'selected' : ''}`}
                      onClick={() => {
                        setExamId(exam.id);
                        setPaperNum(null); // Reset paper when exam changes
                      }}
                      id={`exam-${exam.code.toLowerCase()}`}
                    >
                      <div className="onboard-exam-icon">
                        <FileText size={28} />
                      </div>
                      <div className="onboard-exam-info">
                        <span className="onboard-exam-code">{exam.code}</span>
                        <span className="onboard-exam-name">{exam.name_en}</span>
                        {exam.name_hi && (
                          <span className="onboard-exam-name-hi" lang="hi">{exam.name_hi}</span>
                        )}
                        {exam.state && (
                          <span className="onboard-exam-state">📍 {exam.state}</span>
                        )}
                      </div>
                      {examId === exam.id && (
                        <CheckCircle size={22} className="onboard-option-check" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Paper Selection ── */}
          {step === 5 && (
            <div className="onboard-step">
              <div className="onboard-step-emoji">📄</div>
              <h2 lang="hi">
                {selectedExam?.code} — कौन सा Paper?
              </h2>
              <p className="onboard-step-sub" lang="hi">
                अपना target paper चुनें
              </p>
              <div className="onboard-papers-grid">
                {papers.length > 0 ? papers.map((paper) => (
                  <button
                    key={paper.id}
                    className={`onboard-paper-card ${paperNum === paper.paper_number ? 'selected' : ''}`}
                    onClick={() => setPaperNum(paper.paper_number)}
                    id={`paper-${paper.paper_number}`}
                  >
                    <div className="onboard-paper-number">
                      Paper {paper.paper_number}
                    </div>
                    <h3>{paper.name_en}</h3>
                    {paper.name_hi && (
                      <p className="onboard-paper-hi" lang="hi">{paper.name_hi}</p>
                    )}
                    <div className="onboard-paper-meta">
                      <span>🎯 {paper.total_questions} Questions</span>
                      <span>⏱️ {paper.duration_mins} min</span>
                    </div>
                    {paperNum === paper.paper_number && (
                      <CheckCircle size={22} className="onboard-option-check" />
                    )}
                  </button>
                )) : (
                  /* If only one paper exists, auto-select and show it */
                  <button
                    className={`onboard-paper-card ${paperNum === 1 ? 'selected' : ''}`}
                    onClick={() => setPaperNum(1)}
                  >
                    <div className="onboard-paper-number">Paper 1</div>
                    <h3>{selectedExam?.name_en} — Paper 1</h3>
                    <p className="onboard-paper-hi" lang="hi">
                      {selectedExam?.name_hi} — पेपर 1
                    </p>
                    <div className="onboard-paper-meta">
                      <span>🎯 150 Questions</span>
                      <span>⏱️ 150 min</span>
                    </div>
                    {paperNum === 1 && (
                      <CheckCircle size={22} className="onboard-option-check" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 6: WhatsApp ── */}
          {step === 6 && (
            <div className="onboard-step">
              <div className="onboard-step-emoji">💬</div>
              <h2 lang="hi">WhatsApp Number</h2>
              <p className="onboard-step-sub" lang="hi">
                Study group updates और important alerts के लिए
                <br />
                <small style={{ opacity: 0.7 }}>(Optional — बाद में भी add कर सकते हैं)</small>
              </p>
              <div className="onboard-phone-wrapper">
                <div className="onboard-phone-prefix">
                  <span>🇮🇳</span>
                  <span>+91</span>
                </div>
                <input
                  id="onboard-phone"
                  type="tel"
                  className="onboard-input onboard-phone-input"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 10) setPhone(val);
                  }}
                  inputMode="numeric"
                  onKeyDown={(e) => e.key === 'Enter' && handleComplete()}
                />
              </div>
              <div className="onboard-phone-benefits">
                <div className="onboard-phone-benefit">
                  <MessageCircle size={16} />
                  <span lang="hi">Free UPTET Study Group</span>
                </div>
                <div className="onboard-phone-benefit">
                  <Megaphone size={16} />
                  <span lang="hi">Exam date alerts</span>
                </div>
                <div className="onboard-phone-benefit">
                  <Sparkles size={16} />
                  <span lang="hi">Daily practice reminders</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 7: Celebration ── */}
          {step > TOTAL_STEPS && (
            <div className="onboard-step onboard-celebrate">
              <div className="onboard-celebrate-burst" />
              <div className="onboard-celebrate-emoji">🎉</div>
              <h2 lang="hi">तैयारी शुरू!</h2>
              <p lang="hi" style={{ color: 'var(--muted)' }}>
                {fullName}, आपका account ready है। Dashboard पर ले जा रहे हैं...
              </p>
              <div className="auth-loading-spinner" style={{ marginTop: 'var(--space-4)' }} />
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        {step <= TOTAL_STEPS && (
          <div className="onboard-nav">
            {step > 1 ? (
              <button className="btn btn-ghost" onClick={goBack} id="onboard-back">
                <ArrowLeft size={18} />
                <span lang="hi">वापस</span>
              </button>
            ) : (
              <div />
            )}

            {step < TOTAL_STEPS ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={goNext}
                disabled={!canProceed()}
                id="onboard-next"
              >
                <span lang="hi">आगे बढ़ें</span>
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                className="btn btn-gold btn-lg"
                onClick={handleComplete}
                disabled={saving}
                id="onboard-complete"
              >
                {saving ? (
                  <span lang="hi">Saving...</span>
                ) : (
                  <>
                    <Sparkles size={18} />
                    <span lang="hi">शुरू करें!</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
