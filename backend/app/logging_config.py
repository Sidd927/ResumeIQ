"""
Logging setup. One line per event in ``key=value`` form, e.g.

    2026-09-28T12:00:00 INFO resumeiq.auth event=user_login user_id=4

which is grep-able locally and parsed as structured fields by most log
viewers (Render included). Log user ids, never emails, passwords or tokens.
"""

import logging

from app.config import settings

_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging() -> None:
    level = settings.effective_log_level
    logging.basicConfig(level=level, format=_FORMAT, datefmt="%Y-%m-%dT%H:%M:%S", force=True)
    logging.getLogger("resumeiq").setLevel(level)
    # Chatty third-party libraries stay at WARNING even in debug mode.
    for noisy in ("httpx", "urllib3", "filelock", "sentence_transformers", "huggingface_hub", "pdfminer", "multipart"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
