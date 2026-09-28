"""
Skill Taxonomy Matcher

Loads the curated taxonomy in ``app/data/skills.json`` and resolves free-form
skill mentions to canonical names ("k8s" → "Kubernetes", "ML" → "Machine
Learning"). Everything here is deterministic and side-effect free apart from
the one-time, cached file load.

Two lookup modes:
- ``normalize_skill`` resolves a single skill *item* (e.g. one entry of a
  comma-separated Skills section). Every alias is allowed.
- ``Taxonomy.extract_from_text`` scans *free text* (bullets, JD paragraphs).
  Aliases that are also everyday words or single letters ("go", "c", "rest",
  "spring") are skipped here to avoid false positives like "Go-to person"
  or "the rest of the team".
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

TAXONOMY_PATH = Path(__file__).resolve().parent.parent / "data" / "skills.json"

# Aliases too ambiguous to trust inside prose. They still resolve when they
# appear as an explicit list item (Skills section, "Required: Go, Rust").
AMBIGUOUS_TEXT_ALIASES: frozenset[str] = frozenset(
    {
        "c", "r", "go", "py", "ts", "js", "sh", "ml", "dl", "cv", "pg", "tf", "rest",
        "shell", "node", "spring", "torch", "containers", "transformers", "lambda",
        "s3", "oracle", "elk", "iac", "ror", "rails", "swift", "dart", "express",
        "flask", "helm", "kanban", "scrum", "agile", "statistics", "unix", "faas",
        "vite", "jest", "nest.js", "rtk", "version control", "scalability",
        "algorithms", "data structures",
    }
)

# Characters that count as part of a skill token, so "c" does not match
# inside "c++" and "js" does not match inside "node.js".
_TOKEN_CHARS = r"A-Za-z0-9+#"


def _canon_key(text: str) -> str:
    """Case/whitespace-insensitive lookup key."""
    return re.sub(r"\s+", " ", text.strip().lower()).strip(" .,;:()[]{}\"'")


def _alias_pattern(alias: str) -> re.Pattern[str]:
    """Regex that matches ``alias`` as a whole token (handles c++, ci/cd, .net)."""
    body = re.escape(alias).replace(r"\ ", r"[\s\-]+")
    return re.compile(
        rf"(?<![{_TOKEN_CHARS}.])(?:{body})(?![{_TOKEN_CHARS}]|\.[A-Za-z0-9])",
        re.IGNORECASE,
    )


@dataclass(frozen=True)
class Skill:
    canonical: str
    synonyms: tuple[str, ...]
    category: str


@dataclass(frozen=True)
class Taxonomy:
    """Canonical skills plus a reverse index from every alias to its canonical name."""

    skills: dict[str, Skill]
    alias_to_canonical: dict[str, str]
    _text_patterns: tuple[tuple[str, re.Pattern[str]], ...] = field(repr=False)

    def normalize(self, text: str) -> str | None:
        """Resolve one skill mention to its canonical name, or None if unknown."""
        if not text:
            return None
        return self.alias_to_canonical.get(_canon_key(text))

    def extract_from_text(self, text: str) -> list[str]:
        """
        Find every unambiguous skill mentioned in free text, in order of first
        appearance. Longer aliases win ("react native" masks "react"), and each
        character span is claimed at most once.
        """
        if not text:
            return []
        claimed = [False] * len(text)
        hits: list[tuple[int, str]] = []
        for alias, pattern in self._text_patterns:
            for m in pattern.finditer(text):
                if any(claimed[m.start() : m.end()]):
                    continue
                for i in range(m.start(), m.end()):
                    claimed[i] = True
                hits.append((m.start(), self.alias_to_canonical[alias]))
        return _dedupe(canonical for _, canonical in sorted(hits))

    def category_of(self, canonical: str) -> str | None:
        skill = self.skills.get(canonical)
        return skill.category if skill else None


def _dedupe(items) -> list[str]:  # type: ignore[no-untyped-def]
    """Order-preserving, case-insensitive de-duplication."""
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def build_taxonomy(raw: dict) -> Taxonomy:  # type: ignore[type-arg]
    """Build a Taxonomy from the parsed skills.json structure."""
    skills: dict[str, Skill] = {}
    alias_to_canonical: dict[str, str] = {}
    for entry in raw["skills"]:
        canonical = entry["canonical"]
        synonyms = tuple(entry.get("synonyms", []))
        skills[canonical] = Skill(canonical, synonyms, entry.get("category", "other"))
        for alias in (canonical, *synonyms):
            key = _canon_key(alias)
            # First definition wins; skills.json is validated to be collision-free.
            alias_to_canonical.setdefault(key, canonical)

    text_aliases = sorted(
        (a for a in alias_to_canonical if a not in AMBIGUOUS_TEXT_ALIASES),
        key=len,
        reverse=True,
    )
    patterns = tuple((a, _alias_pattern(a)) for a in text_aliases)
    return Taxonomy(skills, alias_to_canonical, patterns)


@lru_cache(maxsize=1)
def load_taxonomy(path: Path = TAXONOMY_PATH) -> Taxonomy:
    """Load and cache the taxonomy (parsed once per process)."""
    with path.open(encoding="utf-8") as f:
        return build_taxonomy(json.load(f))


def normalize_skill(text: str, taxonomy: Taxonomy | None = None) -> str | None:
    """``normalize_skill("ML")`` → ``"Machine Learning"``; unknown → None."""
    return (taxonomy or load_taxonomy()).normalize(text)


def canonical_or_raw(text: str, taxonomy: Taxonomy) -> str:
    """Canonical name when known, otherwise the cleaned original (never dropped)."""
    return taxonomy.normalize(text) or re.sub(r"\s+", " ", text.strip())


def match_skills(extracted_skills: list[str], taxonomy: Taxonomy | None = None) -> dict[str, list[str]]:
    """
    Split skills into those the taxonomy recognises (returned canonical) and
    those it doesn't (returned as-is — unknown skills are kept, not dropped).
    """
    tax = taxonomy or load_taxonomy()
    matched: list[str] = []
    unmatched: list[str] = []
    for item in extracted_skills:
        canonical = tax.normalize(item)
        if canonical:
            matched.append(canonical)
        elif item.strip():
            unmatched.append(item.strip())
    return {"matched": _dedupe(matched), "unmatched": _dedupe(unmatched)}


def find_missing_skills(
    resume_skills: list[str],
    jd_required: list[str],
    jd_preferred: list[str],
    taxonomy: Taxonomy | None = None,
) -> dict[str, list[str]]:
    """
    JD skills absent from the resume, compared by canonical name so "ML" on a
    resume satisfies "Machine Learning" in a JD. Skills listed as both required
    and preferred count as required.
    """
    tax = taxonomy or load_taxonomy()
    have = {canonical_or_raw(s, tax).lower() for s in resume_skills}
    required = _dedupe(canonical_or_raw(s, tax) for s in jd_required)
    required_keys = {s.lower() for s in required}
    preferred = [p for p in _dedupe(canonical_or_raw(s, tax) for s in jd_preferred) if p.lower() not in required_keys]
    return {
        "required_missing": [s for s in required if s.lower() not in have],
        "preferred_missing": [s for s in preferred if s.lower() not in have],
    }
