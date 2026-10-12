/** Short source-grounded excerpt for the vertical reveal. Never invents benefits. */
export function quickSummary(source: string | null | undefined, limit = 185): string {
  const normalized = (source ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;
  // Prefer an actual sentence boundary if it preserves useful substance.
  const sentence = normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  if (sentence && sentence.length >= 42 && sentence.length <= limit) return sentence;
  const clipped = normalized.slice(0, limit - 1);
  const boundary = clipped.lastIndexOf(' ');
  return (boundary > limit * .72 ? clipped.slice(0, boundary) : clipped).replace(/[\s,;:.!?-]+$/, '') + '…';
}
