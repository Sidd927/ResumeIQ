PROJECT: ResumeIQ — AI-Powered Resume ↔ Job Description Match & Feedback Engine

ROLE
You are my technical co-builder. Treat this file as the permanent source of
truth for scope, architecture, and decisions already made. Don't re-litigate
the core design unless I explicitly ask. Build on top of it.

WHAT WE'RE BUILDING
A web app where a user uploads a resume (PDF/DOCX) and pastes a job
description, and gets back:
- A composite match score (0–100)
- A breakdown into 4 explainable sub-scores:
  1. Skill Match (40%) — taxonomy-based synonym matching, not just literal
     string comparison. Output: the explicit missing-skills list.
  2. Semantic Relevance (30%) — sentence-transformer cosine similarity
     between resume bullet points and JD requirement lines.
  3. Recency & Title Match (20%) — how well the most recent job title
     matches the posting, plus recency-weighted skill presence.
  4. Section Completeness (10%) — did the parser cleanly extract contact,
     work history, education, skills? Penalize + explain if not.
- A list of missing hard skills required by the JD
- (Stretch) AI-generated feedback text via Claude API

DESIGN PRINCIPLE (never violate this)
The scoring engine is a PURE FUNCTION of structured inputs (parsed fields +
embeddings + taxonomy hits). Scores are deterministic and explainable —
no replacing a sub-score with a raw LLM call. The LLM layer (if added) only
generates human-readable feedback FROM the structured scores, never
computes the scores themselves.

TECH STACK (locked — don't suggest swapping unless there's a real blocker)
- Frontend:  React 18 (Vite) + TypeScript + TailwindCSS
- Backend:   Python 3.11+ + FastAPI
- Parsing:   pdfplumber (PDF) + python-docx (DOCX) + spaCy en_core_web_sm (NER)
- Matching:  sentence-transformers (all-MiniLM-L6-v2 or similar small model)
- Taxonomy:  Curated JSON: app/data/skills.json
- Database:  PostgreSQL + SQLAlchemy ORM + Alembic migrations
- Auth:      JWT (access + refresh) + bcrypt password hashing
- Tests:     Pytest + httpx (async test client)
- CI:        GitHub Actions running pytest on every push
- Deploy:    Frontend → Vercel | Backend → Render/Railway | DB → Railway Postgres

MONOREPO STRUCTURE
resumeiq/
├── CLAUDE.md              ← you are here
├── README.md
├── docker-compose.yml
├── .github/workflows/ci.yml
├── backend/
│   ├── requirements.txt
│   ├── alembic/
│   ├── app/
│   │   ├── main.py        ← FastAPI app factory + CORS + router mounts
│   │   ├── config.py      ← Pydantic Settings (env vars)
│   │   ├── database.py    ← SQLAlchemy engine + session
│   │   ├── models/        ← SQLAlchemy: user.py, resume.py, job.py, match.py
│   │   ├── schemas/       ← Pydantic: request/response contracts
│   │   ├── routers/       ← auth.py, resumes.py, jobs.py, match.py
│   │   ├── services/
│   │   │   ├── parser.py      ← PDF/DOCX → structured JSON
│   │   │   ├── scorer.py      ← THE scoring engine (pure function)
│   │   │   ├── embeddings.py  ← sentence-transformers wrapper
│   │   │   └── taxonomy.py    ← skill synonym matcher
│   │   └── data/
│   │       └── skills.json    ← curated skill taxonomy
│   └── tests/
├── frontend/
│   ├── package.json
│   └── src/
│       ├── api/           ← typed axios client + JWT interceptors
│       ├── components/    ← ResumeUpload, JDInput, ScoreBreakdown, etc.
│       ├── hooks/         ← useAuth, useMatch, useHistory
│       ├── pages/         ← Landing, Dashboard, MatchResult, Login
│       └── types/         ← TS interfaces mirroring backend schemas

API SURFACE
POST   /api/auth/register        → { email, password } → { user }
POST   /api/auth/login            → { email, password } → { access_token, refresh_token }
POST   /api/auth/refresh          → { refresh_token }   → { access_token }
POST   /api/resumes               → multipart file      → { resume_id, parsed_json }
POST   /api/jobs                  → { raw_text }         → { job_id, parsed_json }
POST   /api/match                 → { resume_id, job_id }→ { match_result with 4 sub-scores }
GET    /api/match/{id}            → { match_result }
GET    /api/match/history         → [ match_results ]
POST   /api/match/{id}/feedback   → (stretch) triggers LLM feedback generation

DATABASE SCHEMA
users:            id, email, password_hash, created_at
resumes:          id, user_id FK, raw_text, parsed_json JSONB, file_url, created_at
job_descriptions: id, user_id FK, raw_text, parsed_json JSONB, created_at
match_results:    id, resume_id FK, jd_id FK, skill_score FLOAT, semantic_score FLOAT,
                  recency_score FLOAT, completeness_score FLOAT, composite_score FLOAT,
                  missing_skills JSONB, feedback_text TEXT NULL, created_at

SCORING ALGORITHM (scorer.py)
def compute_match(parsed_resume, parsed_jd, taxonomy, embedder):
    skill      = skill_match_score(parsed_resume, parsed_jd, taxonomy)     # 0-1
    semantic   = semantic_relevance_score(parsed_resume, parsed_jd, embedder) # 0-1
    recency    = title_recency_score(parsed_resume, parsed_jd)             # 0-1
    complete   = completeness_score(parsed_resume)                          # 0-1
    composite  = (0.4*skill + 0.3*semantic + 0.2*recency + 0.1*complete) * 100
    missing    = get_missing_skills(parsed_resume, parsed_jd, taxonomy)
    return { skill, semantic, recency, complete, composite, missing }

Each sub-score function is independently unit-testable.

SCOPE BOUNDARIES
- MVP: upload resume + JD → 4-signal score + missing skills + history. Auth. Responsive UI. Deployed live.
- Stretch: Claude API feedback, bullet rewriting, score trend dashboard, format checker.
- OUT: multi-language resumes, real ATS integrations, training our own model.

BUILD ORDER (follow this unless I say otherwise)
Phase 0: Scaffold + CLAUDE.md + README + CI              (Day 1)
Phase 1: Frontend shell with mock data                   (Week 1-2)
Phase 2: Backend API + parsing + scoring standalone       (Week 2-3)
Phase 3: Wire frontend ↔ backend + auth + DB             (Week 3-4)
Phase 4: Deploy + test coverage + README polish           (Week 4-5)
Phase 5: Stretch goals                                    (if time)

HOW TO WORK WITH ME
- Ask which phase we're in if unclear from context, but don't re-explain the project.
- Explain key decisions briefly — I need to defend this in a viva/interview.
- Flag it clearly if something I ask would silently change the architecture.
- Keep scorer.py deterministic and explainable. No LLM calls inside scoring.
- When writing code: type everything, handle errors, add docstrings.
- When creating files: follow the monorepo structure above exactly.
- When I say "next" — move to the next logical step in the current phase.