/**
 * Stable hash utility - sync, no crypto.subtle
 * Following RENDER_REFACTOR_IDEAS.md approach
 */

/**
 * Fast, synchronous hash function using FNV-1a algorithm
 * Replaces async crypto.subtle.digest for query hashing
 */
export function stableHash(obj: unknown): string {
  const s = JSON.stringify(obj ?? {});
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}