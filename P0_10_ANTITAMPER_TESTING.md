# P0.10 Anti-Tamper Testing Guide

## Setup

1. **Deploy SQL Migration**
   ```bash
   # On Supabase dashboard or CLI:
   supabase migration up
   # This will execute 01_schema_changes.sql which includes:
   # - analytics_events and app_errors tables
   # - validate_session_submit RPC function
   ```

2. **Deploy Code Changes**
   - `src/lib/engine/scoringValidation.ts` — RPC wrapper and validation logic
   - `src/pages/app/PracticeSessionPage.tsx` — Updated to call validation on submit
   - `data/01_schema_changes.sql` — Contains RPC definition

---

## Manual Test Scenarios

### Scenario 1: Normal Submission (Happy Path)
**Objective:** Verify that a user legitimately completing a session can submit normally.

**Steps:**
1. Create a practice session (any type)
2. Answer questions normally without deviation
3. Submit the session
4. **Expected:** Session completes successfully, score is recorded correctly

**Validation:**
```bash
# Check logs:
- Telemetry should show: session_submit_success with score_validated: true
- No errors in app_errors table
- practice_sessions.status = 'completed' ✅
```

---

### Scenario 2: Client-Side Score Inflation (Tamper Attempt #1)
**Objective:** Verify that the RPC detects when a user marks a wrong answer as correct.

**Steps:**
1. Start a practice session with 5 questions
2. Answer questions 1-4 correctly (match their answers to correct_option)
3. For question 5, intentionally select the WRONG answer
4. Open browser DevTools → Application → Modify the attempt in memory:
   ```javascript
   // In React DevTools or direct console:
   // Find the attempts state and manually set attempts[4].is_correct = true
   // This simulates client marking wrong answer as "correct"
   ```
5. Click "Submit Session"
6. **Expected:** 
   - RPC validation detects mismatch (client says correct, server says wrong)
   - Alert shows: "⚠️ Validation Failed"
   - Session is NOT submitted
   - Session status remains "in_progress"

**Validation:**
```bash
# Check logs:
- Telemetry: session_submit_error event
- app_errors table: "Tampering detected: score discrepancy"
- practice_sessions.status = 'in_progress' (unchanged) ✅
```

---

### Scenario 3: RPC Recomputation (Tamper Attempt #2)
**Objective:** Verify that RPC recomputes score independently and detects corrections.

**Steps:**
1. Start a practice session
2. Configure client to lie about score:
   ```javascript
   // Before submit, manually adjust the client-computed score:
   // Instead of counting actual is_correct, set to a higher number
   // The RPC will recompute from question_attempts table
   ```
3. Submit session
4. **Expected:**
   - RPC fetches all attempts from DB
   - RPC queries questions table for authoritative correct_option
   - RPC recomputes: for each attempt, check selected_option === questions.correct_option
   - If mismatch found → valid=false, tampering detected
   - If mismatch NOT found but corrections exist → valid=true, score corrected

**Validation:**
```bash
# Check in Supabase:
SELECT * FROM app_errors 
WHERE message LIKE '%Tampering detected%' 
ORDER BY created_at DESC;

# And check telemetry:
SELECT * FROM analytics_events 
WHERE name = 'session_score_corrected' 
ORDER BY created_at DESC;
```

---

### Scenario 4: Answer Key Mutation (Advanced Tamper Attempt #3)
**Objective:** Verify that RPC always fetches fresh correct_option from DB, preventing answer-key-in-memory tampering.

**Steps:**
1. Start session (5 questions)
2. In DevTools, intercept the questions fetch and modify:
   ```javascript
   // Replace question[4].correct_option in-memory from 'C' to 'A'
   // Select option 'A' on question 4
   // Client thinks answer is correct (because modified correct_option = 'A')
   ```
3. Submit session
4. **Expected:**
   - RPC queries fresh correct_option from DB (original 'C')
   - User selected 'A' but correct is 'C'
   - RPC marks as wrong, detects tampering

**Validation:**
```bash
# Check corrections_detail in app_errors:
SELECT context->>'corrections_detail' 
FROM app_errors 
WHERE message LIKE '%Tampering%' 
LIMIT 1;
```

---

### Scenario 5: Direct DB Tampering (Post-Submission) Prevention
**Objective:** Verify that session status prevents replay/revalidation attacks.

**Steps:**
1. Submit a normal session (passes validation)
2. Wait 5 seconds
3. Manually SQL UPDATE in Supabase console (simulate attacker):
   ```sql
   UPDATE practice_sessions 
   SET score = 150, correct = 150 
   WHERE id = '<session_id>';
   ```
4. Try to re-validate using the client RPC call
5. **Expected:**
   - RPC checks session status
   - If already 'completed', RPC returns: "Session already submitted"
   - Score inflation attempt is rejected

**Note:** Session status is checked server-side first, so even if DB is tampered, the RPC will catch it if status ≠ 'in_progress'.

---

## Automated Test Cases (For E2E Suite)

### Test: validate_session_submit RPC (PostgreSQL)
```sql
-- Inject test data
INSERT INTO practice_sessions (id, user_id, status, session_type)
VALUES ('test-session-1', 'test-user-1', 'in_progress', 'practice');

INSERT INTO question_attempts (session_id, user_id, question_id, selected_option, is_correct, question_order)
VALUES 
  ('test-session-1', 'test-user-1', 'q-1', 'A', TRUE, 1),
  ('test-session-1', 'test-user-1', 'q-2', 'B', FALSE, 2);

-- Test 1: Normal case (score matches)
SELECT validate_session_submit('test-session-1', 'test-user-1');
-- Expected: { "valid": true, "corrected_score": 1, "corrections": 0, "message": "OK" }

-- Test 2: Tampering detected (is_correct mismatch)
UPDATE question_attempts 
SET is_correct = TRUE 
WHERE question_id = 'q-2';  -- Mark wrong answer as correct

SELECT validate_session_submit('test-session-1', 'test-user-1');
-- Expected: { "valid": false, "corrected_score": 1, "corrections": 1, "message": "Tampering detected: score discrepancy" }
```

---

## Deployment Checklist

- [ ] Deploy SQL migration (validate_session_submit RPC)
- [ ] Deploy code changes (scoringValidation.ts + PracticeSessionPage.tsx)
- [ ] Manual test: Scenario 1 (happy path) on staging
- [ ] Manual test: Scenario 2 (score inflation) on staging
- [ ] Manual test: Scenario 3 (RPC recomputation) on staging
- [ ] Verify telemetry events in analytics_events table
- [ ] Verify tampering attempts logged in app_errors table
- [ ] Check performance: RPC should complete <500ms even for 150 questions
- [ ] Enable endpoint on production Supabase
- [ ] Deploy code to production
- [ ] Monitor app_errors table for any false positives

---

## Performance Considerations

**RPC Optimization:**
- Single pass through all attempts (O(n) where n = questions in session)
- One JOIN: question_attempts ⋈ questions
- No subqueries or loops inside the DB
- Indexes on (session_id, user_id) and (id) ensure fast lookups

**Expected latency:**
- 5-question practice: ~10-50ms
- 150-question mock test: ~100-300ms

**If performance is an issue:**
Consider caching the correct_option in question_attempts table at creation time (denormalization), but this is not recommended as it weakens the integrity model.

---

## Monitoring Post-Deployment

**Alerts to set up:**
1. `app_errors.message LIKE '%Tampering%'` → Page owner (investigate potential attacks)
2. `validate_session_submit RPC timeout` → Infrastructure team
3. `corrections > 3 per session` → Analytics (unusual number of corrections might indicate answer-key bugs)

**Dashboards to add:**
1. % of sessions passing validation (should be >99% for legitimate users)
2. Tampering incidents per day (should be near 0)
3. Average RPC latency by session_type (monitor performance)

---

## Rollback Plan

If RPC causes issues:

1. **Option A: Disable validation** (for urgent rollback)
   - Comment out `validateSessionSubmit` call in PracticeSessionPage.tsx
   - Sessions will submit without validation
   - Redeploy immediately

2. **Option B: Disable validation alerting** (keep RPC running silently)
   - Add flag to validation result (valid is always true, but log corrections)
   - Users see no blocking alerts, but tampering is still logged

3. **Option C: Return to previous deploy**
   - Revert PracticeSessionPage.tsx changes
   - RPC remains in DB (harmless if not called) for later re-enablement
