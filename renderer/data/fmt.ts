// Shared compact number format for the pet overlay UI.
// K = 1 decimal (e.g. "12.3k"), M = 2 decimals (e.g. "1.23M"), else integer.
export function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}
