# ResumeIQ API — production image (Render, or any container host).
#
#   docker build -t resumeiq-api backend
#   docker run -p 8000:8000 -e JWT_SECRET_KEY=... -e DATABASE_URL=... resumeiq-api
#
# Multi-stage: the builder has a C toolchain (spaCy has no prebuilt wheel on
# some platforms, e.g. linux/arm64) and downloads the NLP models; the runtime
# image receives only the finished virtualenv + model cache — no compiler.

# ── Stage 1: build dependencies and fetch models ─────────────────────────────
FROM python:3.11-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/hf-cache \
    HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# CPU-only PyTorch first: the default Linux wheel drags in ~3 GB of CUDA
# libraries this server can never use.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==2.14.0

# Runtime dependencies only (tests/linters live in requirements-dev.txt).
# requirements.txt also pins the spaCy model wheel, so no `spacy download`.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Bake the sentence-transformer model into the image.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2', device='cpu')"

# ── Stage 2: slim runtime ────────────────────────────────────────────────────
FROM python:3.11-slim

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/hf-cache \
    HF_HUB_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    # Memory: Render's free tier has 512 MB. One inference thread and fewer
    # malloc arenas keep PyTorch's resident memory down.
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    TOKENIZERS_PARALLELISM=false \
    MALLOC_ARENA_MAX=2

RUN useradd --create-home --uid 10001 appuser
COPY --from=builder --chown=appuser /opt/venv /opt/venv
COPY --from=builder --chown=appuser /opt/hf-cache /opt/hf-cache

WORKDIR /app
COPY --chown=appuser . .
USER appuser

ENV ENVIRONMENT=production \
    PRELOAD_MODELS=true \
    AUTO_CREATE_TABLES=false \
    PORT=8000
EXPOSE 8000

# $PORT is injected by Render. --proxy-headers makes request.client the real
# visitor IP (needed for per-IP rate limiting behind Render's proxy).
# One worker: the models live in process memory and the free tier can't fit two copies.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
