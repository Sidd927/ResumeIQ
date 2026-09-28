/** Height of the sticky navbar plus breathing room. */
const HEADER_OFFSET_PX = 88;

/**
 * Smoothly scroll an element into view below the sticky navbar.
 * Uses window.scrollTo rather than scrollIntoView({ behavior: 'smooth' }),
 * which some browsers silently ignore; honours prefers-reduced-motion.
 */
export function scrollToElement(el: Element | null): void {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET_PX;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
}
