"""
4-Signal Scoring Engine

Pure function: (parsed_resume, parsed_jd, taxonomy, embedder) → scores

Sub-scores:
1. skill_match_score (40%) — taxonomy-based synonym matching
2. semantic_relevance_score (30%) — sentence-transformer cosine similarity
3. title_recency_score (20%) — recent title match + recency-weighted skills
4. completeness_score (10%) — section presence/quality check

Composite = 0.4×skill + 0.3×semantic + 0.2×recency + 0.1×completeness (× 100)

Deterministic and explainable: NO LLM calls in this module, ever.

Implementation: Phase 2
"""
