"""
Resume & JD Parsing Service

Resume:  bytes (PDF/DOCX) → text → sections → structured ParsedResume dict
    contact_info  regex (email, phone) + spaCy NER (PERSON name, GPE location)
    work_history  date-range anchored role blocks with bullets, most recent first
    education     degree / institution keyword blocks + graduation year
    skills        explicit Skills section + taxonomy matches anywhere in the text

JD:  text → ParsedJobDescription dict
    title, required vs preferred skills (by section and by inline cues like
    "is a plus"), experience level ("3-5 years", "5+ years"), requirement lines

Design goals: handle standard single-column resumes and common JD layouts,
and fail gracefully — anything not found is null / [] rather than an error.
How much was recovered is exactly what the completeness sub-score measures.
"""

from __future__ import annotations

import io
import logging
import re
import unicodedata
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from app.config import settings
from app.schemas.parsed import ParsedJobDescription, ParsedResume
from app.services.taxonomy import Taxonomy, load_taxonomy

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS: frozenset[str] = frozenset({".pdf", ".docx"})


class ResumeParseError(ValueError):
    """Raised when a file cannot be read at all (wrong type, corrupt, no text)."""


# ═════════════════════════════════════════════════════════════════════════════
# spaCy (lazy, optional)
# ═════════════════════════════════════════════════════════════════════════════


@lru_cache(maxsize=1)
def get_nlp() -> Any | None:
    """
    Load the spaCy pipeline once. The model is installed from requirements.txt
    (pinned wheel) — never downloaded at runtime. If it is missing we log and
    fall back to regex/heuristics instead of failing the request.
    """
    try:
        import spacy

        return spacy.load(settings.spacy_model, disable=["parser", "lemmatizer"])
    except (OSError, ImportError) as exc:  # pragma: no cover - environment dependent
        logger.warning("spaCy model %r unavailable (%s); using heuristic parsing only", settings.spacy_model, exc)
        return None


# ═════════════════════════════════════════════════════════════════════════════
# Text extraction
# ═════════════════════════════════════════════════════════════════════════════

_CID_RE = re.compile(r"\(cid:\d+\)")


def normalize_text(text: str) -> str:
    """Unicode-normalise, fix PDF glyph artefacts, collapse spaces, drop blank-line runs."""
    text = unicodedata.normalize("NFKC", text)
    text = _CID_RE.sub("•", text)  # unmapped PDF bullet glyphs
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    text = text.replace("’", "'").replace("‘", "'")
    lines = [re.sub(r"[  ]{2,}", "  ", line).strip() for line in text.split("\n")]
    out: list[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return "\n".join(out).strip()


def _extract_pdf(file_bytes: bytes) -> str:
    import pdfplumber

    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as exc:  # pdfminer raises many exception types
        raise ResumeParseError("This PDF appears to be corrupted or password-protected.") from exc


def _extract_docx(file_bytes: bytes) -> str:
    from docx import Document
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        doc = Document(io.BytesIO(file_bytes))
    except Exception as exc:  # BadZipFile, KeyError, PackageNotFoundError …
        raise ResumeParseError("This DOCX file could not be opened.") from exc

    def para_text(p: Paragraph) -> str:
        text = p.text.strip()
        if not text:
            return ""
        style = (p.style.name or "").lower() if p.style is not None else ""
        is_list = "list" in style or p._p.pPr is not None and p._p.pPr.numPr is not None
        return f"• {text}" if is_list else text

    lines: list[str] = []
    for section in doc.sections:  # contact details often live in the page header
        lines.extend(para_text(p) for p in section.header.paragraphs)
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            lines.append(para_text(Paragraph(child, doc)))
        elif tag == "tbl":
            for row in Table(child, doc).rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                lines.append("  |  ".join(dict.fromkeys(cells)))  # merged cells repeat
    return "\n".join(lines)


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Extract normalised plain text from a PDF or DOCX. Raises ResumeParseError."""
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        if not file_bytes.startswith(b"%PDF"):
            raise ResumeParseError("File has a .pdf extension but is not a PDF.")
        text = _extract_pdf(file_bytes)
    elif name.endswith(".docx"):
        if not file_bytes.startswith(b"PK"):
            raise ResumeParseError("File has a .docx extension but is not a Word document.")
        text = _extract_docx(file_bytes)
    else:
        raise ResumeParseError("Unsupported file type. Upload a PDF or DOCX.")

    text = normalize_text(text)
    if len(text) < 20:
        raise ResumeParseError("No readable text found. Is this a scanned image? Export a text-based PDF instead.")
    return text


# ═════════════════════════════════════════════════════════════════════════════
# Shared line helpers
# ═════════════════════════════════════════════════════════════════════════════

_BULLET_RE = re.compile(r"^\s*(?:[•●▪◦‣∙·*◆►▶➢✓✔➤○■□-]|–|—|\d{1,2}[.)])\s+")
_SEPARATOR_RE = re.compile(r"\s*(?:\||•|·|●|▪)\s*|\s{2,}")


def _strip_bullet(line: str) -> tuple[bool, str]:
    m = _BULLET_RE.match(line)
    return (True, line[m.end() :].strip()) if m else (False, line.strip())


def _header_key(line: str) -> str:
    key = line.lower().replace("’", "'")
    key = re.sub(r"[^a-z&' ]", " ", key)
    return re.sub(r"\s+", " ", key).strip()


def _match_header(line: str, aliases: dict[str, frozenset[str]], max_len: int = 50) -> tuple[str, str] | None:
    """
    Recognise a section header. Returns (section, trailing content) for either
    a standalone header ("EXPERIENCE", "What you'll do:") or an inline one
    ("Required: React, TypeScript").
    """
    stripped = _strip_bullet(line)[1]
    if len(stripped) <= max_len:
        key = _header_key(stripped)
        for section, names in aliases.items():
            if key in names:
                return section, ""
    if ":" in stripped:
        prefix, rest = stripped.split(":", 1)
        key = _header_key(prefix)
        if len(prefix) <= 40:
            for section, names in aliases.items():
                if key in names:
                    return section, rest.strip()
    return None


def _split_sections(
    lines: list[str],
    aliases: dict[str, frozenset[str]],
    sticky: frozenset[str] = frozenset(),
) -> tuple[list[str], dict[str, list[str]], list[str]]:
    """
    Return (lines before the first header, {section: lines}, order sections were seen).

    Inside a ``sticky`` section, inline "Label: content" lines stay as content
    (so "Languages: Python, Java" inside SKILLS is not the "Languages" section).
    """
    preamble: list[str] = []
    sections: dict[str, list[str]] = {}
    order: list[str] = []
    current: str | None = None
    for line in lines:
        hit = _match_header(line, aliases)
        if hit and hit[1] and current in sticky:
            hit = None
        if hit:
            current, rest = hit
            if current not in sections:
                sections[current] = []
                order.append(current)
            if rest:
                sections[current].append(rest)
            continue
        if current is None:
            preamble.append(line)
        else:
            sections[current].append(line)
    return preamble, sections, order


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if item and key not in seen:
            seen.add(key)
            out.append(item)
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Dates
# ═════════════════════════════════════════════════════════════════════════════

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_MONTH = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
_YEAR = r"(?:19|20)\d{2}"
_DATE = rf"(?:{_MONTH},?\s+{_YEAR}|{_MONTH}\s*'\d{{2}}|(?:0?[1-9]|1[0-2])/{_YEAR}|{_YEAR}[-/](?:0?[1-9]|1[0-2])(?!\d)|{_YEAR})"
_PRESENT = r"(?:present|current(?:ly)?|now|ongoing|today|till date|to date|date)"
DATE_RANGE_RE = re.compile(
    rf"(?<![\w/])(?P<start>{_DATE})\s*(?:-|–|—|to|until|till)\s*(?P<end>{_DATE}|{_PRESENT})(?![\w/])",
    re.IGNORECASE,
)
SINGLE_DATE_RE = re.compile(rf"(?<![\w/])(?:{_MONTH},?\s+{_YEAR}|{_YEAR}[-/](?:0?[1-9]|1[0-2])(?!\d))(?![\w/])", re.IGNORECASE)
_YEAR_RE = re.compile(rf"(?<!\d){_YEAR}(?!\d)")


def parse_date_token(token: str) -> str | None:
    """Normalise one date to "YYYY-MM" or "YYYY". "Present"-like tokens → None (ongoing)."""
    t = token.strip().lower().rstrip(".")
    if re.fullmatch(_PRESENT, t):
        return None
    m = re.match(rf"({_MONTH}),?\s*'?(\d{{2,4}})$", t)
    if m:
        month = _MONTHS[m.group(1)[:3]]
        year = int(m.group(2))
        year = year + 2000 if year < 100 else year
        return f"{year:04d}-{month:02d}"
    m = re.fullmatch(rf"(\d{{1,2}})/({_YEAR})", t)
    if m:
        return f"{m.group(2)}-{int(m.group(1)):02d}"
    m = re.fullmatch(rf"({_YEAR})[-/](\d{{1,2}})", t)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}"
    m = re.fullmatch(_YEAR, t)
    return t if m else None


@dataclass
class DateRange:
    start: str | None
    end: str | None  # None + start ⇒ current role
    span: tuple[int, int]


def find_date_range(line: str) -> DateRange | None:
    """Find "Jan 2023 - Present", "2022-2024", "June 2021 – December 2023", or a lone "Mar 2022"."""
    m = DATE_RANGE_RE.search(line)
    if m:
        return DateRange(parse_date_token(m.group("start")), parse_date_token(m.group("end")), m.span())
    m = SINGLE_DATE_RE.search(line)
    if m:
        d = parse_date_token(m.group(0))
        return DateRange(d, d, m.span())
    return None


def _date_sort_key(value: str | None, *, missing: str) -> str:
    return value if value else missing


# ═════════════════════════════════════════════════════════════════════════════
# Resume: sections
# ═════════════════════════════════════════════════════════════════════════════

RESUME_SECTIONS: dict[str, frozenset[str]] = {
    "summary": frozenset({"summary", "professional summary", "profile", "professional profile", "about me", "about", "objective", "career objective", "career summary"}),
    "experience": frozenset({
        "experience", "work experience", "professional experience", "work history", "employment",
        "employment history", "career history", "relevant experience", "internships", "internship",
        "experience & internships", "internship experience", "industry experience", "work",
    }),
    "education": frozenset({
        "education", "academic background", "academics", "academic qualifications", "qualifications",
        "education & training", "education and training", "educational qualifications", "academic details",
    }),
    "skills": frozenset({
        "skills", "technical skills", "core skills", "key skills", "skills & tools", "skills and tools",
        "technologies", "tech stack", "core competencies", "competencies", "tools", "tools & technologies",
        "technical proficiencies", "skill set", "skillset", "skills & technologies", "technical expertise",
        "programming languages", "languages & frameworks",
    }),
    "projects": frozenset({"projects", "personal projects", "academic projects", "key projects", "selected projects", "side projects"}),
    "certifications": frozenset({"certifications", "certificates", "licenses & certifications", "courses", "certifications & courses"}),
    "other": frozenset({
        "achievements", "awards", "honors", "honours", "publications", "languages", "interests", "hobbies",
        "volunteering", "volunteer experience", "extracurricular activities", "activities", "references",
        "leadership", "positions of responsibility", "awards & achievements", "additional information",
    }),
}

_TITLE_WORD_RE = re.compile(
    r"\b(engineer|engineering|developer|intern|internship|manager|analyst|scientist|designer|lead|consultant|"
    r"architect|specialist|administrator|associate|head|director|officer|coordinator|technician|researcher|"
    r"assistant|programmer|sde|swe|founder|co-founder|president|vp|cto|ceo|tester|qa|devops|sre|"
    r"trainee|fellow|instructor|teacher|tutor|freelancer?|contractor|executive|representative)\b",
    re.IGNORECASE,
)


# ═════════════════════════════════════════════════════════════════════════════
# Resume: contact info
# ═════════════════════════════════════════════════════════════════════════════

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<![\w+])(\+?\(?\d[\d\s().-]{7,}\d)(?!\w)")
_URL_RE = re.compile(r"(https?://\S+|www\.\S+|\S+\.(?:com|io|dev|me|in|org)/\S*|linkedin\S*|github\S*)", re.IGNORECASE)
_NAME_TOKEN_RE = re.compile(r"^[A-Z][A-Za-z'.-]*$|^[A-Z]{2,}$")


def _find_phone(text: str) -> str | None:
    for m in PHONE_RE.finditer(text):
        candidate = m.group(1).strip()
        digits = re.sub(r"\D", "", candidate)
        if 10 <= len(digits) <= 15 and not DATE_RANGE_RE.search(candidate):
            return re.sub(r"\s{2,}", " ", candidate)
    return None


def _segments(line: str) -> list[str]:
    return [s.strip() for s in _SEPARATOR_RE.split(line) if s and s.strip()]


def _looks_like_name(text: str) -> bool:
    tokens = text.split()
    if not 2 <= len(tokens) <= 4 or len(text) > 40:
        return False
    if EMAIL_RE.search(text) or re.search(r"\d", text) or _TITLE_WORD_RE.search(text):
        return False
    if _match_header(text, RESUME_SECTIONS):
        return False
    return all(_NAME_TOKEN_RE.match(t) for t in tokens)


def extract_contact(header_lines: list[str], full_text: str) -> dict[str, str | None]:
    """Email/phone by regex; name via spaCy PERSON (or first name-shaped line); location via GPE."""
    head_text = "\n".join(header_lines) or full_text[:500]
    email_m = EMAIL_RE.search(head_text) or EMAIL_RE.search(full_text)
    phone = _find_phone(_URL_RE.sub(" ", head_text)) or _find_phone(_URL_RE.sub(" ", full_text[:1500]))

    candidates = [seg for line in header_lines[:6] for seg in _segments(line)]
    name_like = [c for c in candidates if _looks_like_name(c)]

    nlp = get_nlp()
    persons: list[str] = []
    places: list[str] = []
    if nlp is not None and candidates:
        doc = nlp("\n".join(candidates))
        persons = [e.text.strip() for e in doc.ents if e.label_ == "PERSON"]
        places = [e.text.strip() for e in doc.ents if e.label_ == "GPE"]

    name = next((c for c in name_like if any(p in c or c in p for p in persons)), None)
    if name is None and name_like:
        name = name_like[0]

    location = None
    for seg in candidates:
        if seg == name or EMAIL_RE.search(seg) or _find_phone(seg) or _URL_RE.search(seg):
            continue
        if any(p in seg for p in places) or re.fullmatch(r"[A-Z][A-Za-z .]+,\s*[A-Z][A-Za-z .]+", seg):
            location = seg
            break

    return {
        "name": name,
        "email": email_m.group(0) if email_m else None,
        "phone": phone,
        "location": location,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Resume: work history
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class _RoleDraft:
    header: list[str] = field(default_factory=list)
    bullets: list[str] = field(default_factory=list)
    start: str | None = None
    end: str | None = None
    has_date: bool = False


def _looks_like_sentence(text: str) -> bool:
    return len(text.split()) >= 8 or text.endswith(".")


def _split_title_company(header: list[str]) -> tuple[str | None, str | None]:
    parts: list[str] = []
    for h in header:
        pieces = re.split(r"\s+(?:at|@)\s+|\s*[|•·]\s*|\s+[—–-]\s+|\s{2,}", h)
        parts.extend(p.strip(" ,-–—") for p in pieces if p and p.strip(" ,-–—"))
    if not parts:
        return None, None
    if len(parts) == 1 and "," in parts[0]:  # "Junior Developer, OldCo"
        parts = [p.strip() for p in parts[0].split(",", 1)]
    title = next((p for p in parts if _TITLE_WORD_RE.search(p)), None)
    rest = [p for p in parts if p != title]
    if title is None:
        title, rest = parts[0], parts[1:]
    company = rest[0].split(",")[0].strip() if rest else None
    return title, company or None


def parse_work_history(lines: list[str]) -> list[dict[str, Any]]:
    """
    Group experience-section lines into roles. A role is a short header block
    (title / company / dates, in any order over 1–3 lines) followed by
    bullets. A new role starts when a header line follows bullets, or when a
    second date range appears. Wrapped bullet lines (starting lowercase) are
    re-joined to the previous bullet.
    """
    drafts: list[_RoleDraft] = []
    cur: _RoleDraft | None = None

    for raw in lines:
        if not raw.strip():
            continue
        is_bullet, text = _strip_bullet(raw)
        if is_bullet:
            if cur is None:
                cur = _RoleDraft()
                drafts.append(cur)
            cur.bullets.append(text)
            continue
        if cur and cur.bullets and text[:1].islower():
            cur.bullets[-1] = f"{cur.bullets[-1]} {text}"
            continue

        dr = find_date_range(text)
        if cur and cur.has_date and not dr and len(cur.header) >= 1 and _looks_like_sentence(text):
            cur.bullets.append(text)  # un-bulleted description sentence
            continue

        if cur is None or cur.bullets or (dr and cur.has_date) or len(cur.header) >= 3:
            cur = _RoleDraft()
            drafts.append(cur)
        if dr:
            cur.start, cur.end, cur.has_date = dr.start, dr.end, True
            text = (text[: dr.span[0]] + " " + text[dr.span[1] :]).strip(" |,-–—()")
        if text:
            cur.header.append(text)

    roles: list[dict[str, Any]] = []
    for d in drafts:
        title, company = _split_title_company(d.header)
        if not (title or company) and not d.bullets:
            continue
        roles.append({"title": title, "company": company, "start_date": d.start, "end_date": d.end, "bullets": d.bullets})

    # Most recent first: ongoing roles, then by end date, then by start date.
    roles.sort(
        key=lambda r: (
            _date_sort_key(r["end_date"], missing="9999" if r["start_date"] else "0000"),
            _date_sort_key(r["start_date"], missing="0000"),
        ),
        reverse=True,
    )
    return roles


# ═════════════════════════════════════════════════════════════════════════════
# Resume: education
# ═════════════════════════════════════════════════════════════════════════════

_DEGREE_RE = re.compile(
    r"\b(?:b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|b\.\s?e\.?|m\.\s?e\.?|b\.\s?s\.?|m\.\s?s\.?|b\.\s?a\.?|m\.\s?a\.?|"
    r"bca|mca|mba|ph\.?\s?d|bachelor(?:'s)?|masters?(?:'s)?|doctor(?:ate)?|diploma|associate(?:'s)? degree|"
    r"high school|hsc|ssc|a-levels|gcse|b\.?com|m\.?com)(?![a-z])",
    re.IGNORECASE,
)
_DEGREE_ABBR_RE = re.compile(r"\b(?:BS|MS|BA|MA|BE|ME|BEng|MEng)\b")  # case-sensitive on purpose
_INSTITUTION_RE = re.compile(r"\b(?:university|college|institute|school|academy|polytechnic|iit|nit|iiit|bits)\b", re.IGNORECASE)
_GPA_RE = re.compile(r"\(?\b(?:c?gpa|cpi|grade|percentage)\b\s*[:\-]?\s*[\d.]+\s*(?:/\s*[\d.]+|%)?\)?", re.IGNORECASE)


def _has_degree(text: str) -> bool:
    return bool(_DEGREE_RE.search(text) or _DEGREE_ABBR_RE.search(text))


def parse_education(lines: list[str]) -> list[dict[str, Any]]:
    """Group education lines into {degree, institution, year} entries."""
    entries: list[dict[str, Any]] = []
    cur: dict[str, Any] | None = None

    def push() -> None:
        if cur and (cur["degree"] or cur["institution"]):
            years = cur.pop("_years")
            cur["year"] = max(years) if years else None
            entries.append(cur)

    for raw in lines:
        text = _strip_bullet(raw)[1]
        if not text:
            continue
        years = [int(y) for y in _YEAR_RE.findall(text)]
        clean = _GPA_RE.sub(" ", DATE_RANGE_RE.sub(" ", text))
        clean = _YEAR_RE.sub(" ", clean)
        segments = [s.strip(" ,-–—()") for s in re.split(r"\s*[|•·]\s*|\s+[—–-]\s+|\s{2,}|,\s(?=[A-Z])", clean)]
        segments = [s for s in segments if s]
        degree = next((s for s in segments if _has_degree(s)), None)
        institution = next((s for s in segments if _INSTITUTION_RE.search(s) and s != degree), None)

        if degree is None and institution is None:
            if cur is not None:
                cur["_years"].extend(years)
            continue
        if cur is None or (degree and cur["degree"]) or (institution and cur["institution"] and not degree):
            push()
            cur = {"degree": None, "institution": None, "_years": []}
        cur["degree"] = cur["degree"] or degree
        cur["institution"] = cur["institution"] or institution
        cur["_years"].extend(years)
    push()
    return entries


# ═════════════════════════════════════════════════════════════════════════════
# Skills (shared by resume + JD)
# ═════════════════════════════════════════════════════════════════════════════

_LIST_SPLIT_RE = re.compile(r"\s*[,;|•·●▪]\s*|\s{2,}")
_FILLER_RE = re.compile(r"^(?:and|or|etc|e\.g|i\.e|including|such as|plus)\b\.?\s*", re.IGNORECASE)


def skills_from_line(line: str, taxonomy: Taxonomy, *, keep_unknown: bool) -> list[str]:
    """
    Extract skills from one line. Short comma-separated items are resolved as
    list entries (any alias allowed, e.g. "Go"); longer phrases fall back to
    unambiguous free-text matching. Unknown short list items are kept verbatim
    when ``keep_unknown`` (explicit skill lists), never silently dropped.
    """
    text = _strip_bullet(line)[1]
    if ":" in text:
        head, tail = text.split(":", 1)
        if len(head.split()) <= 4:  # "Languages: Python, Java"
            text = tail
    text = text.replace("(", ",").replace(")", ",")
    parts = [_FILLER_RE.sub("", p).strip(" .") for p in _LIST_SPLIT_RE.split(text)]
    parts = [p for p in parts if p]
    is_list = len(parts) >= 2 and all(len(p.split()) <= 4 for p in parts)

    found: list[str] = []
    for part in parts:
        canonical = taxonomy.normalize(part)
        if canonical:
            found.append(canonical)
            continue
        if "/" in part:
            subs = [taxonomy.normalize(s) for s in part.split("/")]
            if all(subs):
                found.extend(s for s in subs if s)
                continue
        in_text = taxonomy.extract_from_text(part)
        if in_text:
            found.extend(in_text)
        elif keep_unknown and (is_list or len(parts) == 1) and len(part.split()) <= 4 and len(part) <= 40:
            found.append(part)
    return found


def parse_skills(section_lines: list[str], full_text: str, taxonomy: Taxonomy) -> list[str]:
    """Explicit Skills-section items first, then taxonomy matches anywhere in the resume."""
    explicit = [s for line in section_lines for s in skills_from_line(line, taxonomy, keep_unknown=True)]
    return _dedupe(explicit + taxonomy.extract_from_text(full_text))


# ═════════════════════════════════════════════════════════════════════════════
# Resume entry points
# ═════════════════════════════════════════════════════════════════════════════


def parse_resume_text(text: str, taxonomy: Taxonomy | None = None) -> dict[str, Any]:
    """Parse already-extracted resume text into a ParsedResume dict. Never raises on content."""
    tax = taxonomy or load_taxonomy()
    lines = [line for line in normalize_text(text or "").split("\n")]
    preamble, sections, _ = _split_sections(lines, RESUME_SECTIONS, sticky=frozenset({"skills"}))
    header = [line for line in preamble if line][:10]

    parsed = ParsedResume.model_validate(
        {
            "contact_info": extract_contact(header, text or ""),
            "work_history": parse_work_history(sections.get("experience", [])),
            "education": parse_education(sections.get("education", [])),
            "skills": parse_skills(sections.get("skills", []), text or "", tax),
        }
    )
    return parsed.model_dump()


def parse_resume(file_bytes: bytes, filename: str, taxonomy: Taxonomy | None = None) -> dict[str, Any]:
    """PDF/DOCX bytes → ParsedResume dict. Raises ResumeParseError only if no text can be read."""
    return parse_resume_text(extract_text(file_bytes, filename), taxonomy)


# ═════════════════════════════════════════════════════════════════════════════
# Job descriptions
# ═════════════════════════════════════════════════════════════════════════════

JD_SECTIONS: dict[str, frozenset[str]] = {
    "required": frozenset({
        "requirements", "required", "required skills", "required qualifications", "minimum qualifications",
        "basic qualifications", "qualifications", "must have", "must haves", "must-have", "must-haves",
        "what you'll need", "what you will need", "what we're looking for", "what we are looking for",
        "you have", "who you are", "skills", "key skills", "technical skills", "your skills",
        "skills & experience", "skills and experience", "experience", "what you bring", "you should have",
        "requirements & skills", "tech stack", "our stack", "about you",
    }),
    "preferred": frozenset({
        "preferred", "preferred skills", "preferred qualifications", "nice to have", "nice-to-have",
        "nice to haves", "nice-to-haves", "bonus", "bonus points", "good to have", "pluses", "plus",
        "it's a plus", "extra credit", "desired skills", "desirable", "bonus skills",
    }),
    "responsibilities": frozenset({
        "responsibilities", "key responsibilities", "what you'll do", "what you will do", "the role", "your role",
        "duties", "role", "day to day", "what you'll be doing", "job description", "about the role",
        "in this role", "in this role you will", "your responsibilities", "the job",
    }),
    "other": frozenset({
        "about us", "about the company", "who we are", "benefits", "perks", "what we offer", "why join us",
        "compensation", "how to apply", "location", "salary", "equal opportunity", "our values", "the team",
    }),
}

_PREFERRED_CUE_RE = re.compile(r"\b(?:nice to have|a plus|is a bonus|bonus|preferred|desirable|good to have|would be great)\b", re.IGNORECASE)
_TITLE_PREFIX_RE = re.compile(r"^(?:job title|position|role|title|we're hiring|we are hiring|hiring)\s*[:\-]\s*", re.IGNORECASE)
_EXPERIENCE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.IGNORECASE), "{0}-{1} years"),
    (re.compile(r"(\d{1,2})\s*\+\s*(?:years?|yrs?)", re.IGNORECASE), "{0}+ years"),
    (re.compile(r"(?:at least|minimum(?: of)?|min\.?)\s*(\d{1,2})\s*(?:years?|yrs?)", re.IGNORECASE), "{0}+ years"),
    (re.compile(r"(\d{1,2})\s*(?:years?|yrs?)(?:\s+of)?\s+(?:\w+\s+)?experience", re.IGNORECASE), "{0}+ years"),
)
MAX_REQUIREMENTS = 30


def _jd_title(lines: list[str]) -> str | None:
    for line in lines[:5]:
        if _match_header(line, JD_SECTIONS):
            continue
        text = _TITLE_PREFIX_RE.sub("", _strip_bullet(line)[1])
        text = re.split(r"\s+[—–|-]\s+|\s*\|\s*|\s+\(", text)[0].strip(" :-–—")
        if 0 < len(text) <= 80 and len(text.split()) <= 10:
            return text
    return None


def _experience_level(text: str) -> str | None:
    best: tuple[int, str] | None = None
    for pattern, template in _EXPERIENCE_PATTERNS:
        m = pattern.search(text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), template.format(*m.groups()))
    return best[1] if best else None


def parse_job_description(raw_text: str, taxonomy: Taxonomy | None = None) -> dict[str, Any]:
    """
    Parse a pasted JD into a ParsedJobDescription dict.

    - Required skills come from requirement-type sections; if the JD has no
      such sections, from the whole text (minus preferred/other sections).
    - Preferred skills come from "nice to have"-type sections, plus any line
      with an inline cue ("Kubernetes is a plus"). Required wins on overlap.
    - Requirements are the bullet lines of responsibility/requirement
      sections (the semantic signal compares these to resume bullets).
    """
    tax = taxonomy or load_taxonomy()
    text = normalize_text(raw_text or "")
    lines = [line for line in text.split("\n") if line.strip()]
    if not lines:
        return ParsedJobDescription().model_dump()

    preamble, sections, _ = _split_sections(lines, JD_SECTIONS)

    required: list[str] = []
    preferred: list[str] = []
    required_lines = sections.get("required", [])
    fallback_lines = preamble + sections.get("responsibilities", []) if not required_lines else []

    for line in required_lines + fallback_lines:
        target = preferred if _PREFERRED_CUE_RE.search(line) else required
        target.extend(skills_from_line(line, tax, keep_unknown=line in required_lines))
    for line in sections.get("preferred", []):
        preferred.extend(skills_from_line(line, tax, keep_unknown=True))
    for line in sections.get("responsibilities", []):
        if _PREFERRED_CUE_RE.search(line):
            preferred.extend(skills_from_line(line, tax, keep_unknown=False))

    required = _dedupe(required)
    required_keys = {s.lower() for s in required}
    preferred = [s for s in _dedupe(preferred) if s.lower() not in required_keys]

    # Requirement lines for semantic matching: bullets first, then prose.
    source = sections.get("responsibilities", []) + required_lines
    requirements = [
        _strip_bullet(line)[1] for line in source if _BULLET_RE.match(line) and len(line.split()) >= 4
    ]
    if not requirements:
        requirements = [
            _strip_bullet(line)[1] for line in (source or lines[1:]) if len(line.split()) >= 5
        ]
    if not requirements:
        sentences = re.split(r"(?<=[.!?])\s+", " ".join(lines))
        requirements = [s.strip() for s in sentences if len(s.split()) >= 6]

    parsed = ParsedJobDescription(
        title=_jd_title(lines),
        required_skills=required,
        preferred_skills=preferred,
        experience_level=_experience_level(text),
        requirements=_dedupe(requirements)[:MAX_REQUIREMENTS],
    )
    return parsed.model_dump()
