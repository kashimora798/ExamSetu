#!/usr/bin/env python3
"Backfill PYQ explanations from OCR/text into questions.sql exports.

Usage examples:
 python backfill_pyq_explanations.py \
    --sql data/2019.sql \
    --source "data/Pages from UPTET SOLVED PAPERS PRIMARY LEVEL (I-V)2019(1)_watermark.pdf" \
    --out updates.sql \
    --review review.json
If PDF text extraction is unavailable in your environment, pre-extract OCR text to a .txt file
and pass that as --source instead.
"

from __future__ import annotations
import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional
@dataclass
class QuestionRow:
    legacy_id: str
    question_hi: str
    question_en: str
    explanation_hi: Optional[str]
    explanation_en: Optional[str]
    source_year: int
    paper_number: int
QUESTION_TEXT_FIELDS = ["question_hi", "question_en"]
EXPLANATION_MARKERS = ["व्याख्या", "Explanation", "Solution", "हल", "उत्तर", "Answer", "Explanation:", "Solution:"]

def sql_unescape(value: str) -> str:
    return value.replace("''", "'")


def parse_sql_dump(sql_path: Path) -> list[dict[str, str]]:
    text = sql_path.read_text(encoding="utf-8")
    m_cols = re.search(r'INSERT INTO\s+"?[\w\.]+"?\s*\((.*?)\)\s*VALUES\s*\(', text, re.S | re.I)
    if not m_cols:
        raise ValueError(f"Could not find INSERT column list in {sql_path}")
    cols = [c.strip().strip('"') for c in m_cols.group(1).split(',')]

    start = m_cols.end() - 1
    rows = []
    depth = 0
    in_str = False
    esc = False
    buf = []

    for ch in text[start:]:
        if in_str:
            buf.append(ch)
            if ch == "'" and not esc:
                in_str = False
            esc = (ch == "'" and not esc)
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
            esc = False
            continue
        if ch == '(':
            depth += 1
            if depth == 1:
                buf = []
                continue
        elif ch == ')':
            depth -= 1
            if depth == 0:
                rows.append("".join(buf).strip())
                buf = []
                continue
        elif ch == ';' and depth == 0:
            break
        if depth >= 1:
            buf.append(ch)

    parsed: list[dict[str, str]] = []
    for row in rows:
        values = split_sql_tuple(row)
        if len(values) != len(cols):
            # keep going, but skip malformed rows
            continue
        item: dict[str, str] = {}
        for col, val in zip(cols, values):
            item[col] = val
        parsed.append(item)
    return parsed

def split_sql_tuple(row: str) -> list[str]:
    values: list[str] = []
    buf: list[str] = []
    in_str = False
    esc = False
    paren = 0
    bracket = 0
    brace = 0
    i = 0
    while i < len(row):
        ch = row[i]
        if in_str:
            buf.append(ch)
            if ch == "'" and not esc:
                in_str = False
            esc = (ch == "'" and not esc)
            i += 1
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
            esc = False
        elif ch == '(': paren += 1; buf.append(ch)
        elif ch == ')': paren -= 1; buf.append(ch)
        elif ch == '[': bracket += 1; buf.append(ch)
        elif ch == ']': bracket -= 1; buf.append(ch)
        elif ch == '{': brace += 1; buf.append(ch)
        elif ch == '}': brace -= 1; buf.append(ch)
        elif ch == ',' and paren == 0 and bracket == 0 and brace == 0:
            values.append(clean_sql_value("".join(buf).strip()))
            buf = []
        else:
            buf.append(ch)
        i += 1
    if buf:
        values.append(clean_sql_value("".join(buf).strip()))
    return values

def clean_sql_value(value: str) -> str:
    if value.upper() == 'NULL':
        return ''
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return sql_unescape(value[1:-1])
    return value

def normalize(s: str) -> str:
    return re.sub(r"\s+", "", re.sub(r"[\u200b\u200c\u200d\ufeff]", "", s or "").lower())


def build_questions(rows: list[dict[str, str]]) -> list[QuestionRow]:
    out: list[QuestionRow] = []
    for r in rows:
        out.append(QuestionRow(
            legacy_id=r.get('legacy_id', ''),
            question_hi=r.get('question_hi', ''),
            question_en=r.get('question_en', ''),
            explanation_hi=(r.get('explanation_hi') or None),
            explanation_en=(r.get('explanation_en') or None),
            source_year=int(r.get('source_year') or 0),
            paper_number=int(r.get('paper_number') or 1),
        ))
    return out

def extract_text(source: Path) -> str:
    if source.suffix.lower() in {'.txt', '.md'}:
        return source.read_text(encoding='utf-8', errors='ignore')

    if source.suffix.lower() == '.pdf':
        # Try text extraction first, then OCR fallback if libraries are available.
        text = ''
        try:
            import fitz # type: ignore
            doc = fitz.open(str(source))
            text = '\n'.join(page.get_text('text') for page in doc)
        except Exception:
            text = ''

        if len(text.strip()) < 200:
            try:
                from pdf2image import convert_from_path # type: ignore
                import pytesseract # type: ignore
                pages = convert_from_path(str(source), dpi=300)
                chunks = []
                for i, img in enumerate(pages, start=1):
                    chunks.append(f"\n\n--- PAGE {i} ---\n\n")
                    chunks.append(pytesseract.image_to_string(img, lang='eng+hin'))
                text = ''.join(chunks)
            except Exception as e:
                raise RuntimeError(
                    'Could not extract text from PDF. Install PyMuPDF/pdf2image+pytesseract or provide a .txt OCR export.'
                ) from e
        return text
    raise ValueError(f"Unsupported source type: {source}")


def question_pattern(q: QuestionRow) -> Optional[re.Pattern[str]]:
    candidate = q.question_hi if len(q.question_hi or '') >= len(q.question_en or '') else q.question_en
    if not candidate:
        return None
    tokens = [re.escape(tok) for tok in re.split(r"\s+", candidate.strip()) if tok]
    if not tokens:
        return None
    # Flexible between words to survive OCR line breaks / punctuation.
    pattern = ''.join(tok + r"[\s\-\.,:;\(\)\[\]\/\u0964\u0965]*" for tok in tokens)
    return re.compile(pattern, re.I | re.S)


def extract_explanation(block: str) -> tuple[Optional[str], Optional[str]]:
    # Prefer text after explanation markers.
    marker_re = re.compile(r"(?:" + "|".join(re.escape(m) for m in EXPLANATION_MARKERS) + r")", re.I)
    m = marker_re.search(block)
    if not m:
        return None, None
    tail = block[m.end():].strip()
    tail = re.split(r"\n\s*(?:Q\.?\s*\d+|प्रश्न\s*\d+|\d+\.|\d+\)|---\s*PAGE\s*\d+\s*---)", tail, maxsplit=1, flags=re.I | re.S)[0].strip()
    if not tail:
        return None, None
    # Split into Hindi / English if the block has a clear divider.
    if '\n' in tail:
        lines = [ln.strip() for ln in tail.splitlines() if ln.strip()]
        if len(lines) >= 2 and any(re.search(r"[A-Za-z]", ln) for ln in lines[:2]) and any(re.search(r"[\u0900-\u097F]", ln) for ln in lines[:2]):
            hi = next((ln for ln in lines if re.search(r"[\u0900-\u097F]", ln)), None)
            en = next((ln for ln in lines if re.search(r"[A-Za-z]", ln)), None)
            return hi, en
    return tail, None

def match_explanations(questions: list[QuestionRow], source_text: str) -> tuple[list[dict], list[dict]]:
    review: list[dict] = []
    updates: list[dict] = []

    # Keep a moving cursor so matches follow paper order.
    cursor = 0
    normalized_source = normalize(source_text)

    for q in questions:
        pat = question_pattern(q)
        if not pat:
            review.append({'legacy_id': q.legacy_id, 'reason': 'missing_question_text'})
            continue
        # Search in a reasonable window after the cursor first.
        window = source_text[cursor:]
        m = pat.search(window)
        if not m:
            # fallback: search entire text by normalized substring
            q_norm = normalize(q.question_hi or q.question_en)
            idx = normalized_source.find(q_norm)
            if idx < 0:
                review.append({'legacy_id': q.legacy_id, 'reason': 'question_not_found'})
                continue
            # Cannot map normalized index exactly; use fallback around nearest cursor.
            start = max(0, cursor - 200)
            end = min(len(source_text), cursor + 4000)
            block = source_text[start:end]
            hi, en = extract_explanation(block)
            if hi or en:
                updates.append({'legacy_id': q.legacy_id, 'explanation_hi': hi, 'explanation_en': en})
                cursor = end
            else:
                review.append({'legacy_id': q.legacy_id, 'reason': 'no_explanation_marker'})
            continue
        start = cursor + m.start()
        # Find next question after this one.
        next_start = len(source_text)
        for other in questions[questions.index(q) + 1:questions.index(q) + 15]:
            other_pat = question_pattern(other)
            if not other_pat:
                continue
            mm = other_pat.search(source_text, start + len(m.group(0)))
            if mm and mm.start() < next_start:
                next_start = mm.start()
        block = source_text[start:next_start]
        hi, en = extract_explanation(block)
        if hi or en:
            updates.append({'legacy_id': q.legacy_id, 'explanation_hi': hi, 'explanation_en': en})
        else:
            review.append({'legacy_id': q.legacy_id, 'reason': 'no_explanation_marker'})
        cursor = next_start
    return updates, review

def sql_quote(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def render_updates_sql(updates: list[dict], out_path: Path) -> None:
    lines = ["-- Auto-generated explanation backfill updates", "BEGIN;"]
    for u in updates:
        sets = []
        if u.get('explanation_hi'):
            sets.append(f"explanation_hi = {sql_quote(u['explanation_hi'])}")
        if u.get('explanation_en'):
            sets.append(f"explanation_en = {sql_quote(u['explanation_en'])}")
        if sets:
            sets.append("explanation_source = 'manual'")
            sets.append("explanation_verified = false")
            lines.append(
                f"UPDATE public.questions SET {', '.join(sets)} WHERE legacy_id = {sql_quote(u['legacy_id'])};"
            )
    lines.append("COMMIT;")
    out_path.write_text("\n".join(lines) + "\n", encoding='utf-8')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--sql', required=True, help='SQL export containing questions rows')
    ap.add_argument('--source', required=True, help='OCR text file or PDF to extract text from')
    ap.add_argument('--out', default='updates.sql', help='SQL output file')
    ap.add_argument('--review', default='review.json', help='Review JSON file for unmatched rows')
    ap.add_argument('--limit', type=int, default=0, help='Only process first N questions (for testing)')
    args = ap.parse_args()

    sql_path = Path(args.sql)
    source_path = Path(args.source)
    out_path = Path(args.out)
    review_path = Path(args.review)

    rows = parse_sql_dump(sql_path)
    questions = build_questions(rows)
    if args.limit:
        questions = questions[:args.limit]

    source_text = extract_text(source_path)
    updates, review = match_explanations(questions, source_text)

    render_updates_sql(updates, out_path)
    review_path.write_text(json.dumps({'updates': updates, 'review': review}, ensure_ascii=False, indent=2), encoding='utf-8')

    print(f'Questions loaded: {len(questions)}')
    print(f'Updates generated: {len(updates)}')
    print(f'Review items: {len(review)}')
    print(f'Wrote: {out_path}')
    print(f'Wrote: {review_path}')
    return 0
if __name__ == '__main__':
    raise SystemExit(main())
