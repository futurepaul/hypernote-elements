/**
 * Clock utilities - safe time expression handling
 * Following RENDER_REFACTOR_IDEAS.md approach
 */

import type { Clock } from '../services';

/**
 * Resolve time expressions safely without dangerous eval
 * Supports only time.now and basic arithmetic
 */
export function resolveTimeExpression(expr: string, clock: Clock): unknown {
  // Only allow expressions containing time.now
  if (!/\btime\.now\b/.test(expr)) {
    return undefined;
  }

  const replaced = expr.replace(/\btime\.now\b/g, String(clock.now()));
  
  // Only allow safe arithmetic (no function calls, no variables, etc)
  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) {
    console.warn(`Unsafe time expression rejected: ${expr}`);
    return undefined;
  }

  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict";return (${replaced})`)();
  } catch (e) {
    console.warn(`Failed to evaluate time expression: ${expr}`);
    return undefined;
  }
}