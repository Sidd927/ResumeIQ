"""
In-memory sliding-window rate limiter for credential endpoints.

Good enough for a single-process deployment (we run one uvicorn worker). With
several workers or instances each process would count separately — the fix
then is a shared store such as Redis.
"""

from __future__ import annotations

import logging
import math
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request, status

from app.config import settings

logger = logging.getLogger("resumeiq.security")

WINDOW_SECONDS = 60.0


class SlidingWindowLimiter:
    """Allow at most ``limit`` hits per ``window`` seconds for each key."""

    def __init__(self, window: float = WINDOW_SECONDS) -> None:
        self.window = window
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str, limit: int, now: float | None = None) -> float | None:
        """Record a hit. Returns None if allowed, else seconds until the next slot frees up."""
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= limit:
                return max(0.0, hits[0] + self.window - now)
            hits.append(now)
            if len(self._hits) > 10_000:  # bound memory: drop idle keys
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    # Behind Render's proxy, uvicorn --proxy-headers already resolved
    # X-Forwarded-For into request.client.
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, per_minute: int):  # type: ignore[no-untyped-def]
    """FastAPI dependency factory: 429 + Retry-After once an IP exceeds ``per_minute``."""

    def dependency(request: Request) -> None:
        if not settings.rate_limit_enabled:
            return
        ip = client_ip(request)
        retry_after = limiter.hit(f"{name}:{ip}", per_minute)
        if retry_after is not None:
            seconds = max(1, math.ceil(retry_after))
            logger.warning("event=rate_limited endpoint=%s ip=%s retry_after=%s", name, ip, seconds)
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Too many attempts. Please try again in {seconds} seconds.",
                headers={"Retry-After": str(seconds)},
            )

    return dependency
