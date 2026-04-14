import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

const STATUS_OPTS = ['open', 'in_review', 'resolved', 'rejected'] as const;
const TYPE_OPTS = ['all', 'typo', 'wrong_answer', 'wrong_explanation', 'translation_issue', 'other'] as const;

export default function ReportsModerationPage() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadReports();
  }, [user, isAdmin, statusFilter, typeFilter]);

  const loadReports = async () => {
    setLoading(true);
    let query = supabase
      .from('questions_reports')
      .select('id, question_id, report_type, report_text, source, status, moderator_note, created_at, questions(question_hi, question_en, subject_code, source_year), user_profiles!questions_reports_user_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (typeFilter !== 'all') {
      query = query.eq('report_type', typeFilter);
    }

    const { data } = await query;
    setReports(data || []);
    setLoading(false);
  };

  const updateStatus = async (id: number, nextStatus: string) => {
    if (!user) return;
    setUpdatingId(id);
    const { error } = await supabase
      .from('questions_reports')
      .update({
        status: nextStatus,
        resolved_by: nextStatus === 'resolved' || nextStatus === 'rejected' ? user.id : null,
        resolved_at: nextStatus === 'resolved' || nextStatus === 'rejected' ? new Date().toISOString() : null,
      })
      .eq('id', id);

    if (!error) {
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: nextStatus } : r));
    }
    setUpdatingId(null);
  };

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Reports Moderation</h1>
        <p style={{ color: '#6b7280' }}>You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px', paddingBottom: '100px' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: '1.6rem', fontWeight: 900 }}>Content Reports</h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280' }}>Review typo/content issue reports submitted by learners.</p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db' }}>
          <option value="all">All status</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db' }}>
          {TYPE_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: '24px', color: '#6b7280' }}>Loading reports...</div>
      ) : reports.length === 0 ? (
        <div style={{ padding: '24px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '14px' }}>No reports found for current filters.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reports.map((r) => (
            <div key={r.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 700 }}>Report #{r.id}</div>
                  <div style={{ fontWeight: 800, color: '#111827' }}>{r.questions?.subject_code || 'Subject'} · {r.questions?.source_year || 'N/A'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>By {r.user_profiles?.full_name || 'Learner'} · {new Date(r.created_at).toLocaleString('en-IN')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.74rem', background: '#eef2ff', color: '#4338ca', padding: '4px 9px', borderRadius: '999px', fontWeight: 700 }}>{r.report_type}</span>
                  <span style={{ fontSize: '0.74rem', background: '#f3f4f6', color: '#374151', padding: '4px 9px', borderRadius: '999px', fontWeight: 700 }}>{r.status}</span>
                </div>
              </div>

              <div style={{ marginTop: '10px', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '0.82rem', color: '#111827', lineHeight: 1.5 }}>{r.questions?.question_hi || r.questions?.question_en || 'Question text unavailable'}</div>
              </div>

              {r.report_text && (
                <div style={{ marginTop: '8px', fontSize: '0.82rem', color: '#4b5563' }}>
                  <strong>Note:</strong> {r.report_text}
                </div>
              )}

              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {STATUS_OPTS.map(s => (
                  <button key={s} onClick={() => updateStatus(r.id, s)} disabled={updatingId === r.id || r.status === s}
                    style={{ border: '1px solid #d1d5db', background: r.status === s ? '#111827' : 'white', color: r.status === s ? 'white' : '#374151', padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.74rem', cursor: r.status === s ? 'default' : 'pointer', opacity: updatingId === r.id ? 0.6 : 1 }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
