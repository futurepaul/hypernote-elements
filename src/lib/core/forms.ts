/**
 * Pure form utilities - no React, no stores, no network
 * Following RENDER_REFACTOR_IDEAS.md approach
 */

import type { Hypernote, AnyElement } from '../schema';

// Type alias for backwards compatibility
type HypernoteElement = AnyElement;

/**
 * Derive initial form data by scanning for hidden inputs
 * Replaces setTimeout during render with pure pre-calculation
 */
export function deriveInitialFormData(h: Hypernote): Record<string, string> {
  const acc: Record<string, string> = {};
  
  const walk = (els?: HypernoteElement[]) => {
    els?.forEach((el) => {
      if (el.type === "input") {
        const name = el.attributes?.name;
        const type = el.attributes?.type || "text";
        const val = el.attributes?.value || "";
        if (name && type === "hidden" && acc[name] === undefined) {
          acc[name] = val;
        }
      }
      if (el.elements) walk(el.elements);
    });
  };
  
  walk(h.elements);
  return acc;
}