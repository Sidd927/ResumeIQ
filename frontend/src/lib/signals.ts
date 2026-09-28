import type { MatchResponse } from '../types';

/** The four sub-score fields on a MatchResponse. */
export type SignalKey = keyof Pick<
  MatchResponse,
  'skill_score' | 'semantic_score' | 'recency_score' | 'completeness_score'
>;

export interface Signal {
  key: SignalKey;
  name: string;
  /** Weight in the composite formula (0–1). Mirrors backend scorer.py. */
  weight: number;
  /** Brand hex for inline SVG / style usage. */
  color: string;
  /** Full Tailwind class strings (kept literal so Tailwind can detect them). */
  barClass: string;
  softBgClass: string;
  textClass: string;
  /** Short marketing description (landing page). */
  pitch: string;
  /** What the signal measures (shown when a score bar is expanded). */
  explanation: string;
}

/**
 * Display metadata for the 4 scoring signals. Weights are for display only —
 * the backend scoring engine is the single source of truth for the math.
 */
export const SIGNALS: readonly Signal[] = [
  {
    key: 'skill_score',
    name: 'Skill Match',
    weight: 0.4,
    color: '#2563EB',
    barClass: 'bg-[#2563EB]',
    softBgClass: 'bg-[#2563EB]/10',
    textClass: 'text-[#2563EB]',
    pitch: "Taxonomy-based matching with synonym awareness — 'ML' and 'Machine Learning' count as the same skill.",
    explanation:
      'Compares the hard skills the job requires against the skills found on your resume, normalising synonyms (k8s → Kubernetes) through a curated taxonomy.',
  },
  {
    key: 'semantic_score',
    name: 'Semantic Relevance',
    weight: 0.3,
    color: '#7C3AED',
    barClass: 'bg-[#7C3AED]',
    softBgClass: 'bg-[#7C3AED]/10',
    textClass: 'text-[#7C3AED]',
    pitch: 'AI embeddings compare what you wrote to what they need — meaning matters, not just keywords.',
    explanation:
      "Embeds each resume bullet and each job requirement with a sentence-transformer model, then measures how closely your experience covers what they're asking for.",
  },
  {
    key: 'recency_score',
    name: 'Title & Recency',
    weight: 0.2,
    color: '#D97706',
    barClass: 'bg-[#D97706]',
    softBgClass: 'bg-[#D97706]/10',
    textClass: 'text-[#D97706]',
    pitch: 'Your most recent role matters most — just like real ATS recency bias.',
    explanation:
      "Checks how well your most recent job title matches the posting and weights skills you've used recently above ones from years ago.",
  },
  {
    key: 'completeness_score',
    name: 'Section Completeness',
    weight: 0.1,
    color: '#16A34A',
    barClass: 'bg-[#16A34A]',
    softBgClass: 'bg-[#16A34A]/10',
    textClass: 'text-[#16A34A]',
    pitch: 'Did your resume parse cleanly? Missing sections = lost points.',
    explanation:
      'Verifies that contact info, work history, education and skills were all extracted cleanly. Sections a parser cannot read cost you points.',
  },
] as const;

/** Sub-score (0–1) → whole-number percentage. */
export function toPercent(subScore: number): number {
  return Math.round(subScore * 100);
}

/** Points a signal contributes to the composite (0–100 scale). */
export function contribution(signal: Signal, match: MatchResponse): number {
  return signal.weight * match[signal.key] * 100;
}
