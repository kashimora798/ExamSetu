# Session Protection - Manual Testing Guide

## Quick Test (5 minutes)

### Test 1: Modal Appears for Completed Session
**Steps:**
1. Open your app in browser
2. Start a fresh practice session (any type)
3. Answer a few questions
4. Click "Submit" to complete the session
5. Note the session ID from the URL or results page
6. **Go back in browser history** OR paste `/session/{sessionId}` in URL
7. **Expected:** Green modal appears immediately: "Session Already Submitted"
   - ✅ Green checkmark icon
   - ✅ Hindi text: "यह सेशन पहले ही submit हो गया है..."
   - ✅ "View Results →" button
8. Click "View Results →"
9. **Expected:** Redirected to `/results/{sessionId}` (not `/session/{sessionId}`)

---

### Test 2: No Questions Loaded for Completed Session
**Check browser DevTools:**
1. Open DevTools (F12) → Network tab → Filter by "question_attempts"
2. Try accessing a completed session again
3. **Expected:** No `question_attempts` query in network tab
   - This proves questions were NOT fetched from DB
   - Session status was checked first, before queries

---

### Test 3: Back Button Goes to Dashboard (Not Back to Session)
**Steps:**
1. Submit a practice session
2. On results page (`/results/{sessionId}`), click back button
   - Should say: "← Back to Dashboard"
3. **Expected:** Navigate to `/dashboard`, NOT `/practice`
4. From dashboard, try to go back to the session via browser back button
5. **Expected:** Modal appears again (session protection working)

---

### Test 4: Different Session Types
**Test with:**

#### Topic Practice (Regular Results Page)
```
Start: /session/:id (status='in_progress')
Submit: ✓ Questions load normally
Redirect to: /results/:id
Back button: → /dashboard
```

#### Mock Test (Exam Results Page) 
```
Start: /session/:id (status='in_progress')
Submit: ✓ Questions load normally
Redirect to: /mock-results/:id
Back button: → /mock-test (different from other types)
```

---

## Database Verification

### Check Session Status
```sql
SELECT id, session_type, status, completed_at 
FROM practice_sessions 
WHERE user_id = auth.uid()
ORDER BY completed_at DESC 
LIMIT 1;
```

**Should show:**
- `status = 'completed'`
- `completed_at = NOW()` (recent timestamp)

---

### Check Modal Shows on Page Load
1. Open DevTools → Console
2. Navigate to `/session/{completed-session-id}`
3. Watch for log (if dev mode):
   ```
   [PracticeSessionPage] Session already completed, showing modal
   ```

---

## Acceptance Criteria Checklist

- [ ] Modal appears within 1 second when accessing completed session
- [ ] Modal has green checkmark icon (not warning/error icon)
- [ ] Modal title says "Session Already Submitted"
- [ ] Modal has Hindi message about session being submitted
- [ ] "View Results →" button works and redirects correctly
- [ ] No questions are fetched from DB for completed sessions
- [ ] Results page shows "Back to Dashboard" button (not "Practice Hub")
- [ ] Clicking back from results → navigates to /dashboard
- [ ] Attempting to re-access session from browser history → modal appears again
- [ ] Works for both topic practice AND mock test sessions
- [ ] No TypeScript errors in console
- [ ] Modal responsive on mobile (90% width, under 400px max)

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Modal doesn't appear | Verify session status is 'completed' in DB |
| Wrong redirect after modal | Check session_type (mock_test → /mock-results, else → /results) |
| Questions still loading | Verify loadData() has early return at line 94 |
| Back button goes to practice | Verify button onClick is `navigate('/dashboard')` not '/practice' |
| Modal appears for in-progress session | Session status probably still 'in_progress' - submit to complete first |

---

## Code Locations for Reference

| File | Purpose | Line |
|------|---------|------|
| `SessionCompleteModal.tsx` | Modal component | 1-80 |
| `PracticeSessionPage.tsx` | Completion check | 94-97 |
| `PracticeSessionPage.tsx` | Modal render | 525-530 |
| `PracticeResultsPage.tsx` | Back button | 265-266 |

---

## Performance Notes
- ✅ Modal check happens on initial load (before question queries)
- ✅ Zero additional database queries for completed sessions
- ✅ Modal renders in < 50ms (CSS animation handles visual feedback)
- ✅ No JavaScript overhead for normal (in-progress) sessions

