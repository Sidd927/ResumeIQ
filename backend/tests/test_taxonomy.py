import json

import pytest

from app.services.taxonomy import (
    AMBIGUOUS_TEXT_ALIASES,
    TAXONOMY_PATH,
    find_missing_skills,
    match_skills,
    normalize_skill,
)


class TestNormalize:
    @pytest.mark.parametrize(
        "text, expected",
        [
            ("machine learning", "Machine Learning"),
            ("ML", "Machine Learning"),
            ("k8s", "Kubernetes"),
            ("  PostgreSQL  ", "PostgreSQL"),
            ("postgres", "PostgreSQL"),
            ("React.js", "React"),
            ("nodejs", "Node.js"),
            ("C++", "C++"),
            ("c#", "C#"),
            (".NET", ".NET"),
            ("CI/CD", "CI/CD"),
            ("Tailwind CSS", "TailwindCSS"),
            ("Go", "Go"),  # ambiguous words still resolve as explicit list items
        ],
    )
    def test_aliases_resolve_to_canonical(self, text, expected):
        assert normalize_skill(text) == expected

    @pytest.mark.parametrize("text", ["some unknown skill", "", "   ", "Figma"])
    def test_unknown_returns_none(self, text):
        assert normalize_skill(text) is None


def test_match_skills_keeps_unknown_skills(taxonomy):
    result = match_skills(["python3", "React.js", "Figma", "k8s", "Underwater Basket Weaving", "Python"], taxonomy)
    assert result["matched"] == ["Python", "React", "Kubernetes"]  # deduplicated, canonical
    assert result["unmatched"] == ["Figma", "Underwater Basket Weaving"]  # kept, not dropped


def test_find_missing_skills_splits_required_and_preferred(taxonomy):
    missing = find_missing_skills(
        resume_skills=["React", "ts", "Postgres"],
        jd_required=["React", "TypeScript", "AWS"],
        jd_preferred=["PostgreSQL", "GraphQL"],
        taxonomy=taxonomy,
    )
    assert missing == {"required_missing": ["AWS"], "preferred_missing": ["GraphQL"]}


def test_find_missing_skills_uses_synonyms(taxonomy):
    missing = find_missing_skills(["ML", "sklearn"], ["Machine Learning"], ["Scikit-learn"], taxonomy)
    assert missing == {"required_missing": [], "preferred_missing": []}


def test_skill_in_both_lists_is_reported_as_required(taxonomy):
    missing = find_missing_skills([], ["Docker"], ["Docker", "Redis"], taxonomy)
    assert missing == {"required_missing": ["Docker"], "preferred_missing": ["Redis"]}


class TestExtractFromText:
    def test_finds_skills_in_prose(self, taxonomy):
        text = "Built microservices with FastAPI and PostgreSQL, deployed via GitHub Actions to AWS."
        assert taxonomy.extract_from_text(text) == ["Microservices", "FastAPI", "PostgreSQL", "GitHub Actions", "AWS"]

    def test_ambiguous_everyday_words_are_ignored(self, taxonomy):
        text = "I was the go-to person for the rest of the team every spring."
        assert taxonomy.extract_from_text(text) == []

    def test_symbol_heavy_skills_tokenise_correctly(self, taxonomy):
        # "c" must not match inside "c++", nor "js" inside "node.js".
        assert taxonomy.extract_from_text("Wrote C++ and C# plus node.js tooling") == ["C++", "C#", "Node.js"]

    def test_longest_alias_wins(self, taxonomy):
        assert taxonomy.extract_from_text("Shipped a React Native app") == ["React Native"]

    def test_hyphenated_variants_match(self, taxonomy):
        assert taxonomy.extract_from_text("Applied machine-learning and CI/CD practices") == ["Machine Learning", "CI/CD"]


def test_taxonomy_file_is_consistent():
    """Every alias maps to exactly one canonical skill, and the taxonomy is big enough to be useful."""
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    seen: dict[str, str] = {}
    for entry in data["skills"]:
        for alias in [entry["canonical"], *entry["synonyms"]]:
            key = alias.lower()
            assert seen.setdefault(key, entry["canonical"]) == entry["canonical"], f"{alias!r} is ambiguous"
    assert len(data["skills"]) >= 80
    assert AMBIGUOUS_TEXT_ALIASES <= set(seen), "ambiguous-alias list references unknown aliases"
