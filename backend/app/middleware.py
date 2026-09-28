"""HTTP middleware: security headers and an early upload-size guard."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

# Multipart framing (boundaries, part headers) on top of the file itself.
MULTIPART_OVERHEAD_BYTES = 64 * 1024

_BASE_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-site",
}
_HSTS = "max-age=31536000; includeSubDomains"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds defensive headers to every response. HSTS is only sent in production,
    where the API is served over HTTPS (it would break plain-HTTP localhost).
    No Content-Security-Policy: the API returns JSON, and a strict CSP would
    block the CDN assets Swagger UI (/docs) loads.
    """

    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        super().__init__(app)
        self.headers = {**_BASE_SECURITY_HEADERS, **({"Strict-Transport-Security": _HSTS} if hsts else {})}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for name, value in self.headers.items():
            response.headers.setdefault(name, value)
        return response


class UploadSizeLimitMiddleware(BaseHTTPMiddleware):
    """
    Reject oversized uploads from the Content-Length header BEFORE the body is
    read, so a 1 GB upload is never spooled to disk. The route still checks
    the real byte count (Content-Length can be absent or wrong).
    """

    def __init__(self, app: ASGIApp, *, path: str, max_bytes: int) -> None:
        super().__init__(app)
        self.path = path.rstrip("/")
        self.limit = max_bytes + MULTIPART_OVERHEAD_BYTES
        self.max_mb = max_bytes // (1024 * 1024)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method == "POST" and request.url.path.rstrip("/") == self.path:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > self.limit:
                return JSONResponse({"detail": f"File is larger than {self.max_mb} MB."}, status_code=413)
        return await call_next(request)
