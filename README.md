# ResumeIQ

**AI-powered resume ↔ job description matcher that returns an explainable 0–100 score, a 4-signal breakdown, and the exact hard skills you're missing.**

![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## Why it's different

Most "resume scorers" either do naive keyword counting or hand the whole thing to an LLM and print whatever number comes back. ResumeIQ's scoring engine is a **pure, deterministic function** of structured inputs (parsed fields + embeddings + taxonomy hits). Same inputs → same score, and every point is traceable to a sub-score. An LLM is only (optionally) used to turn those structured scores into human-readable feedback — it never computes a score.

## Architecture

```mermaid
flowchart LR
    U([User]) --> FE["React Frontend<br/>(Vite + TS + Tailwind)"]
    FE -- "REST + JWT" --> API["FastAPI Backend"]

    subgraph NLP["Processing Layer"]
        P["Parsing Layer<br/>pdfplumber · python-docx · spaCy NER"]
        E["Embedding Layer<br/>sentence-transformers (MiniLM)"]
        T["Taxonomy Matcher<br/>skills.json synonyms"]
    end

    API --> P
    P --> E
    P --> T
    E --> S["Scoring Engine<br/>(pure function, deterministic)"]
    T --> S
    P --> S
    S --> DB[("PostgreSQL")]
    API <--> DB

    S -. "structured scores only" .-> L["LLM Feedback<br/>(Claude API · optional)"]
    L -.-> DB
```

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18, Vite, TypeScript, TailwindCSS, React Router, Recharts, Axios |
| Backend  | Python 3.11+, FastAPI, Pydantic v2, Uvicorn |
| NLP      | pdfplumber, python-docx, spaCy (`en_core_web_sm`), sentence-transformers (`all-MiniLM-L6-v2`), curated skill taxonomy |
| Database | PostgreSQL 16, SQLAlchemy 2.0, Alembic |
| Auth     | JWT (access + refresh), bcrypt |
| Testing  | Pytest, httpx / FastAPI TestClient |
| CI       | GitHub Actions |
| Deploy   | Vercel (frontend) · Render/Railway (backend) · Railway Postgres |

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20.19+ or 22+
- Docker (for local Postgres) — optional until Phase 3

### 1. Clone & configure

```bash
git clone <repo-url> resumeiq && cd resumeiq
cp .env.example backend/.env
```

### 2. Database (optional for now)

```bash
docker compose up -d db
```

### 3. Backend

```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head          # needs the database running
uvicorn app.main:app --reload # → http://localhost:8000/docs
```

Run the tests (no database required):

```bash
python -m pytest -v
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev                   # → http://localhost:5173
```

Type-check: `npm run typecheck`

## Project Structure

```
resumeiq/
├── CLAUDE.md                  # project source of truth
├── README.md
├── docker-compose.yml         # local Postgres
├── .env.example
├── .github/workflows/ci.yml   # pytest + typecheck on every push
├── backend/
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/               # migrations (env.py reads DATABASE_URL from app config)
│   ├── app/
│   │   ├── main.py            # FastAPI app + CORS + router mounts
│   │   ├── config.py          # Pydantic Settings (env vars)
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   ├── models/            # user, resume, job, match
│   │   ├── schemas/           # Pydantic request/response contracts
│   │   ├── routers/           # health, auth, resumes, jobs, match
│   │   ├── services/
│   │   │   ├── parser.py      # PDF/DOCX → structured JSON
│   │   │   ├── scorer.py      # the scoring engine (pure function)
│   │   │   ├── embeddings.py  # sentence-transformers wrapper
│   │   │   └── taxonomy.py    # skill synonym matcher
│   │   └── data/skills.json   # curated skill taxonomy
│   └── tests/
└── frontend/
    ├── package.json
    └── src/
        ├── api/               # typed axios client + JWT interceptors
        ├── components/
        ├── hooks/
        ├── pages/
        └── types/             # TS interfaces mirroring backend schemas
```

## API Endpoints

| Method | Path                       | Body                        | Returns |
|--------|----------------------------|-----------------------------|---------|
| POST   | `/api/auth/register`       | `{ email, password }`       | `{ user }` |
| POST   | `/api/auth/login`          | `{ email, password }`       | `{ access_token, refresh_token }` |
| POST   | `/api/auth/refresh`        | `{ refresh_token }`         | `{ access_token }` |
| POST   | `/api/resumes`             | multipart file (PDF/DOCX)   | `{ resume_id, parsed_json }` |
| POST   | `/api/jobs`                | `{ raw_text }`              | `{ job_id, parsed_json }` |
| POST   | `/api/match`               | `{ resume_id, job_id }`     | match result with 4 sub-scores |
| GET    | `/api/match/{id}`          | —                           | match result |
| GET    | `/api/match/history`       | —                           | list of match results |
| POST   | `/api/match/{id}/feedback` | —                           | *(stretch)* LLM feedback text |

Plus `GET /health` for liveness. Interactive docs at `/docs` (Swagger) and `/redoc`.

## Scoring Algorithm

```
composite = (0.4 × skill + 0.3 × semantic + 0.2 × recency + 0.1 × completeness) × 100
```

| Signal | Weight | How it's computed | Explains |
|--------|:------:|-------------------|----------|
| **Skill Match** | 40% | JD required skills vs. resume skills, normalized through the synonym taxonomy (`k8s` = `Kubernetes`) | Explicit missing-skills list |
| **Semantic Relevance** | 30% | Cosine similarity between resume bullet embeddings and JD requirement-line embeddings | Which requirements are/aren't covered |
| **Recency & Title** | 20% | Most recent job title vs. posting title + recency-weighted skill presence | Whether relevant experience is current |
| **Section Completeness** | 10% | Did the parser cleanly extract contact, work history, education, skills? | Which sections are missing/unparseable |

Each sub-score is in `[0, 1]` and implemented as an independently unit-tested function in `backend/app/services/scorer.py`.

## Roadmap

- [x] **Phase 0** — Scaffold, CI, migrations
- [ ] **Phase 1** — Frontend shell with mock data
- [ ] **Phase 2** — Parsing + scoring engine + API
- [ ] **Phase 3** — Wire frontend ↔ backend, auth, DB
- [ ] **Phase 4** — Deploy, coverage, polish
- [ ] **Phase 5** — Stretch: Claude feedback, bullet rewriting, trend dashboard

## License

MIT
