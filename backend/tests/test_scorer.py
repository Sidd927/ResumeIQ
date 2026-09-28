"""
The scoring engine — the most important tests in the project.

Each sub-score is tested in isolation, then the orchestrator is tested for
the composite formula, determinism and purity. Semantic tests use the REAL
all-MiniLM-L6-v2 model; math tests use a stub embedder so the arithmetic is
checked exactly.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import date

import pytest

from app.services import scorer
from app.services.scorer import (
    SEMANTIC_CEILING,
    SEMANTIC_FLOOR,
    WEIGHTS,
    calibrate_similarity,
    completeness_score,
    compute_match,
    role_recency_weight,
    semantic_relevance_score,
    skill_match_score,
    title_recency_score,
    title_similarity,
)

TODAY = date(2026, 9, 28)


# ═════════════════════════════ skill_match_score ═════════════════════════════


class TestSkillMatch:
    def test_perfect_match_is_one(self, taxonomy):
        assert skill_match_score(["React", "AWS", "Redis"], ["React", "AWS"], ["Redis"], taxonomy) == 1.0

    def test_zero_overlap_is_zero(self, taxonomy):
        assert skill_match_score(["Java", "Spring Boot"], ["React", "AWS"], ["Redis"], taxonomy) == 0.0

    def test_partial_match_is_weighted(self, taxonomy, sample_parsed_resume, sample_parsed_jd):
        # Required: 6 of 8 matched (missing Node.js, AWS). Preferred: 2 of 5 (Python, FastAPI).
        # (2·6 + 1·2) / (2·8 + 1·5) = 14 / 21
        score = skill_match_score(
            sample_parsed_resume["skills"],
            sample_parsed_jd["required_skills"],
            sample_parsed_jd["preferred_skills"],
            taxonomy,
        )
        assert score == pytest.approx(14 / 21)

    def test_required_skills_weigh_double(self, taxonomy):
        only_required = skill_match_score(["React"], ["React"], ["Redis"], taxonomy)  # 2 / 3
        only_preferred = skill_match_score(["Redis"], ["React"], ["Redis"], taxonomy)  # 1 / 3
        assert only_required == pytest.approx(2 / 3)
        assert only_preferred == pytest.approx(1 / 3)

    def test_synonyms_match_through_taxonomy(self, taxonomy):
        # "ML", "k8s", "postgres" on the resume satisfy the canonical names in the JD.
        score = skill_match_score(
            ["ML", "k8s", "postgres"], ["Machine Learning", "Kubernetes", "PostgreSQL"], [], taxonomy
        )
        assert score == 1.0

    def test_unknown_skills_compare_case_insensitively(self, taxonomy):
        assert skill_match_score(["figma"], ["Figma"], [], taxonomy) == 1.0

    def test_skill_in_both_lists_counts_once_as_required(self, taxonomy):
        # React is required AND preferred → counted once (weight 2); Redis preferred (weight 1).
        assert skill_match_score(["React"], ["React"], ["React", "Redis"], taxonomy) == pytest.approx(2 / 3)

    def test_jd_without_skills_has_nothing_missing(self, taxonomy):
        assert skill_match_score(["Python"], [], [], taxonomy) == 1.0


# ══════════════════════════ semantic_relevance_score ═════════════════════════


class TestSemanticRelevance:
    def test_identical_texts_score_about_one(self, embedder):
        texts = ["Design and implement RESTful APIs", "Write unit and integration tests"]
        assert semantic_relevance_score(texts, texts, embedder) == pytest.approx(1.0, abs=1e-3)

    def test_unrelated_texts_score_low(self, embedder, sample_parsed_jd):
        nurse = [
            "Administer medications and monitor patient vital signs in the ICU",
            "Coordinate discharge planning with physicians and families",
            "Maintain accurate patient charts in the hospital records system",
        ]
        assert semantic_relevance_score(nurse, sample_parsed_jd["requirements"], embedder) < 0.15

    def test_paraphrases_score_decently(self, embedder):
        resume = ["Created automated test suites to verify code quality before every release"]
        jd = ["Write clean, testable code with comprehensive unit tests"]
        assert semantic_relevance_score(resume, jd, embedder) > 0.5

    def test_relevant_resume_beats_unrelated_resume(self, embedder, sample_parsed_resume, sample_parsed_jd):
        dev = scorer.resume_semantic_texts(sample_parsed_resume)
        chef = ["Prepared seasonal menus and managed kitchen inventory", "Trained line cooks on food safety"]
        jd = sample_parsed_jd["requirements"]
        assert semantic_relevance_score(dev, jd, embedder) > semantic_relevance_score(chef, jd, embedder) + 0.4

    @pytest.mark.parametrize("bullets, reqs", [([], ["Build APIs"]), (["Built APIs"], []), ([], []), (["  "], [""])])
    def test_empty_inputs_return_zero_without_calling_model(self, stub_embedder, bullets, reqs):
        stub = stub_embedder(0.9)
        assert semantic_relevance_score(bullets, reqs, stub) == 0.0
        assert stub.calls == 0

    @pytest.mark.parametrize(
        "raw, expected",
        [
            (0.0, 0.0),
            (SEMANTIC_FLOOR, 0.0),
            (SEMANTIC_CEILING, 1.0),
            (1.0, 1.0),
            ((SEMANTIC_FLOOR + SEMANTIC_CEILING) / 2, 0.5),
        ],
    )
    def test_calibration_is_linear_and_clamped(self, raw, expected):
        assert calibrate_similarity(raw) == pytest.approx(expected)


# ════════════════════════════ title_recency_score ════════════════════════════


class TestTitleSimilarity:
    def test_identical_titles(self):
        assert title_similarity("Backend Engineer", "Backend Engineer") == 1.0

    def test_synonyms_and_spelling_variants(self):
        # "Sr." ≡ "Senior", "Back-End" ≡ "Backend", "Developer" ≡ "Engineer".
        assert title_similarity("Sr. Backend Engineer", "Senior Back-End Developer") == 1.0

    def test_one_level_below_posting_costs_fifteen_percent(self):
        assert title_similarity("Full Stack Developer", "Senior Full Stack Developer") == pytest.approx(0.85)

    def test_unrelated_titles_score_low(self):
        assert title_similarity("Registered Nurse", "Senior Full Stack Developer") < 0.25

    def test_empty_titles(self):
        assert title_similarity("", "Engineer") == 0.0


class TestRecencyWeight:
    def test_current_role_is_fully_recent(self):
        assert role_recency_weight({"start_date": "2024-06", "end_date": None}, TODAY) == 1.0

    def test_role_ended_within_two_years_is_fully_recent(self):
        assert role_recency_weight({"start_date": "2023-01", "end_date": "2025-01"}, TODAY) == 1.0

    def test_older_roles_decay_with_two_year_half_life(self):
        # Ended ~6 years before TODAY → 4 years past the window → 0.5² = 0.25
        weight = role_recency_weight({"start_date": "2018-01", "end_date": "2020-09"}, TODAY)
        assert weight == pytest.approx(0.25, abs=0.01)

    def test_unknown_dates_are_neutral(self):
        assert role_recency_weight({"start_date": None, "end_date": None}, TODAY) == 0.5


class TestTitleRecency:
    def test_matching_recent_title_scores_high(self, taxonomy):
        history = [
            {
                "title": "Senior Full Stack Developer",
                "start_date": "2023-01",
                "end_date": None,
                "bullets": ["Built React and Node.js services on AWS with PostgreSQL"],
            }
        ]
        score = title_recency_score(
            history,
            "Senior Full Stack Developer",
            jd_skills=["React", "Node.js", "AWS", "PostgreSQL"],
            taxonomy=taxonomy,
            reference_date=TODAY,
        )
        assert score == pytest.approx(1.0)

    def test_no_work_history_is_zero(self, taxonomy):
        assert title_recency_score([], "Senior Full Stack Developer", ["React"], taxonomy, TODAY) == 0.0

    def test_same_skills_used_long_ago_score_lower(self, taxonomy):
        def history(end: str | None) -> list[dict]:
            return [
                {
                    "title": "Full Stack Developer",
                    "start_date": "2016-01",
                    "end_date": end,
                    "bullets": ["Built React apps on AWS"],
                }
            ]

        kwargs = {"jd_skills": ["React", "AWS"], "taxonomy": taxonomy, "reference_date": TODAY}
        recent = title_recency_score(history(None), "Full Stack Developer", **kwargs)
        stale = title_recency_score(history("2019-01"), "Full Stack Developer", **kwargs)
        assert recent == pytest.approx(1.0)
        assert stale < recent - 0.3

    def test_uses_most_recent_role_title(self, taxonomy):
        history = [
            {"title": "Data Scientist", "start_date": "2024-01", "end_date": None, "bullets": []},
            {"title": "Full Stack Developer", "start_date": "2020-01", "end_date": "2023-12", "bullets": []},
        ]
        score = title_recency_score(history, "Full Stack Developer", reference_date=TODAY)
        # Title component comes from "Data Scientist" (low); recency falls back to the current role (1.0).
        assert score < 0.75

    def test_depends_on_reference_date_not_wall_clock(self, taxonomy, sample_parsed_resume, sample_parsed_jd):
        args = (
            sample_parsed_resume["work_history"],
            sample_parsed_jd["title"],
            sample_parsed_jd["required_skills"],
            taxonomy,
        )
        assert title_recency_score(*args, reference_date=TODAY) == title_recency_score(*args, reference_date=TODAY)
        assert title_recency_score(*args, reference_date=date(2035, 1, 1)) < title_recency_score(
            *args, reference_date=TODAY
        )


# ════════════════════════════ completeness_score ═════════════════════════════


class TestCompleteness:
    def test_fully_parsed_resume_is_one(self, sample_parsed_resume):
        assert completeness_score(sample_parsed_resume) == 1.0

    def test_missing_sections_reduce_score_proportionally(self, sample_parsed_resume):
        sample_parsed_resume["education"] = []  # −0.20
        assert completeness_score(sample_parsed_resume) == pytest.approx(0.80)
        sample_parsed_resume["work_history"] = []  # −0.30
        assert completeness_score(sample_parsed_resume) == pytest.approx(0.50)
        sample_parsed_resume["contact_info"]["email"] = None  # −0.125
        assert completeness_score(sample_parsed_resume) == pytest.approx(0.375)

    def test_fewer_than_three_skills_get_partial_credit(self, sample_parsed_resume):
        sample_parsed_resume["skills"] = ["Python"]
        assert completeness_score(sample_parsed_resume) == pytest.approx(0.75 + 0.25 / 3)

    def test_empty_resume_is_zero(self):
        assert completeness_score({}) == 0.0
        assert completeness_score({"contact_info": None, "work_history": None, "skills": None}) == 0.0


# ══════════════════════════════ compute_match ════════════════════════════════


class TestComputeMatch:
    def test_returns_all_fields_in_range(self, sample_parsed_resume, sample_parsed_jd, taxonomy, embedder):
        result = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, embedder, TODAY)
        assert set(result) == {*WEIGHTS, "composite_score", "missing_skills"}
        for key in WEIGHTS:
            assert 0.0 <= result[key] <= 1.0
        assert 0.0 <= result["composite_score"] <= 100.0

    def test_composite_equals_weighted_sum(self, sample_parsed_resume, sample_parsed_jd, taxonomy, embedder):
        r = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, embedder, TODAY)
        expected = (
            0.4 * r["skill_score"]
            + 0.3 * r["semantic_score"]
            + 0.2 * r["recency_score"]
            + 0.1 * r["completeness_score"]
        ) * 100
        assert r["composite_score"] == pytest.approx(expected, abs=0.005)

    def test_composite_math_with_stub_embedder(self, sample_parsed_resume, sample_parsed_jd, taxonomy, stub_embedder):
        # Raw 0.40 → calibrated (0.40 − 0.15) / 0.50 = 0.5 exactly.
        r = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, stub_embedder(0.40), TODAY)
        assert r["skill_score"] == pytest.approx(round(14 / 21, 4))
        assert r["semantic_score"] == 0.5
        assert r["completeness_score"] == 1.0
        expected = 0.4 * r["skill_score"] + 0.3 * 0.5 + 0.2 * r["recency_score"] + 0.1 * 1.0
        assert r["composite_score"] == round(expected * 100, 2)

    def test_missing_skills_required_first_then_preferred(
        self, sample_parsed_resume, sample_parsed_jd, taxonomy, stub_embedder
    ):
        r = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, stub_embedder(0.4), TODAY)
        assert r["missing_skills"] == ["Node.js", "AWS", "Redis", "GraphQL", "Kubernetes"]

    def test_is_deterministic(self, sample_parsed_resume, sample_parsed_jd, taxonomy, embedder):
        first = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, embedder, TODAY)
        second = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, embedder, TODAY)
        assert first == second

    def test_does_not_mutate_inputs(self, sample_parsed_resume, sample_parsed_jd, taxonomy, stub_embedder):
        resume_before, jd_before = deepcopy(sample_parsed_resume), deepcopy(sample_parsed_jd)
        compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, stub_embedder(0.4), TODAY)
        assert sample_parsed_resume == resume_before
        assert sample_parsed_jd == jd_before

    def test_empty_inputs_do_not_crash(self, taxonomy, stub_embedder):
        r = compute_match({}, {}, taxonomy, stub_embedder(0.9), TODAY)
        assert r == {
            "skill_score": 1.0,  # the JD asks for nothing, so nothing is missing
            "semantic_score": 0.0,
            "recency_score": 0.0,
            "completeness_score": 0.0,
            "composite_score": 40.0,
            "missing_skills": [],
        }

    def test_strong_candidate_outscores_weak_one(self, sample_parsed_resume, sample_parsed_jd, taxonomy, embedder):
        weak = {
            "contact_info": {"name": "Sam Cook", "email": "sam@example.com"},
            "work_history": [
                {"title": "Head Chef", "start_date": "2019-01", "end_date": None, "bullets": ["Ran a 40-cover kitchen"]}
            ],
            "education": [],
            "skills": ["Cooking", "Menu Planning"],
        }
        strong = compute_match(sample_parsed_resume, sample_parsed_jd, taxonomy, embedder, TODAY)
        weak_result = compute_match(weak, sample_parsed_jd, taxonomy, embedder, TODAY)
        assert strong["composite_score"] > weak_result["composite_score"] + 40
