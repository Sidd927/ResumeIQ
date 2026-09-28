export type ScoreTone = 'strong' | 'good' | 'moderate' | 'weak';

export interface ScoreBand {
  tone: ScoreTone;
  label: string;
  message: string;
  /** Hex used by the SVG gauge stroke. */
  color: string;
  textClass: string;
  badgeClass: string;
  dotClass: string;
}

const BANDS: Record<ScoreTone, ScoreBand> = {
  strong: {
    tone: 'strong',
    label: 'Strong match',
    message: 'Strong match — your profile aligns well with this role.',
    color: '#16A34A',
    textClass: 'text-green-700',
    badgeClass: 'bg-green-50 text-green-700 ring-green-600/20',
    dotClass: 'bg-green-600',
  },
  good: {
    tone: 'good',
    label: 'Good potential',
    message: 'Good potential — a few areas to strengthen before applying.',
    color: '#2563EB',
    textClass: 'text-blue-700',
    badgeClass: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    dotClass: 'bg-blue-600',
  },
  moderate: {
    tone: 'moderate',
    label: 'Moderate match',
    message: 'Moderate match — significant gaps exist. Review the missing skills below.',
    color: '#EA580C',
    textClass: 'text-orange-700',
    badgeClass: 'bg-orange-50 text-orange-700 ring-orange-600/20',
    dotClass: 'bg-orange-500',
  },
  weak: {
    tone: 'weak',
    label: 'Weak match',
    message: 'Weak match — this role may require substantial additional experience.',
    color: '#DC2626',
    textClass: 'text-red-700',
    badgeClass: 'bg-red-50 text-red-700 ring-red-600/20',
    dotClass: 'bg-red-600',
  },
};

/**
 * One set of thresholds drives colour AND wording, so the gauge colour can
 * never disagree with the interpretation sentence.
 */
export function getScoreBand(composite: number): ScoreBand {
  if (composite >= 80) return BANDS.strong;
  if (composite >= 60) return BANDS.good;
  if (composite >= 40) return BANDS.moderate;
  return BANDS.weak;
}
