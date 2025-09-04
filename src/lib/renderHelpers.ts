/**
 * Pure helper functions extracted from renderer.tsx
 * Zero React dependencies - safe to extract
 */

import { resolveVariables } from './pipes';

// Simple render context interface for helpers (no React-specific stuff)
export interface RenderContext {
  queryResults: Record<string, any>;
  extractedVariables: Record<string, any>;
  formData: Record<string, string>;
  userPubkey: string | null;
  loopVariables: Record<string, any>;
  target?: any;
}

/**
 * Single pure function for ALL variable resolution
 * Extracted from renderer.tsx - zero React dependencies
 */
export function resolveExpression(expr: string, ctx: RenderContext): any {
  // Normalize expression - handle with or without $ prefix
  const cleanExpr = expr.startsWith('$') ? expr.slice(1) : expr;
  
  // Handle dot notation for property access
  const [base, ...path] = cleanExpr.split('.');
  
  let value: any = undefined;
  
  // Resolution priority (first match wins):
  
  // 1. Loop variables (highest priority - most local scope)
  // Check both with and without $ prefix for compatibility
  if (ctx.loopVariables[`$${base}`] !== undefined) {
    value = ctx.loopVariables[`$${base}`];
  } else if (ctx.loopVariables[base] !== undefined) {
    value = ctx.loopVariables[base];
  }
  // 2. Query results
  else if (ctx.queryResults[`$${base}`] !== undefined) {
    value = ctx.queryResults[`$${base}`];
  } else if (ctx.queryResults[base] !== undefined) {
    value = ctx.queryResults[base];
  }
  // 3. Extracted variables (stored without $ prefix)
  else if (ctx.extractedVariables[base] !== undefined) {
    value = ctx.extractedVariables[base];
  }
  // 4. Built-in contexts
  else if (base === 'user') {
    value = { pubkey: ctx.userPubkey };
  } else if (base === 'target' && ctx.target) {
    value = ctx.target;
  } else if (base === 'form') {
    value = ctx.formData;
  } else if (base === 'time') {
    value = { now: Date.now() };
  }
  
  // Handle nested property access
  if (value !== undefined && path.length > 0) {
    // If value is an array and we're accessing properties, use first item
    const baseValue = Array.isArray(value) && value.length > 0 ? value[0] : value;
    
    // For Kind 0 events, the profile data is in the content field as JSON
    // We need to parse it if accessing profile properties
    if (baseValue?.kind === 0 && baseValue?.content && path[0] !== 'content' && path[0] !== 'kind' && path[0] !== 'pubkey' && path[0] !== 'created_at' && path[0] !== 'id') {
      try {
        const profileData = JSON.parse(baseValue.content);
        const result = path.reduce((obj, prop) => obj?.[prop], profileData);
        // Only return the parsed result if we found the property
        if (result !== undefined) {
          return result;
        }
      } catch (e) {
        // If parsing fails, try normal property access
      }
    }
    
    const result = path.reduce((obj, prop) => obj?.[prop], baseValue);
    // Return null/undefined as-is instead of empty string to indicate missing value
    return result;
  }
  
  // Special handling for time expressions
  if (value === undefined && expr.includes('time.now')) {
    try {
      const timeNow = Date.now();
      const result = expr.replace(/time\.now/g, timeNow.toString());
      return new Function('return ' + result)();
    } catch (e) {
      console.warn(`Failed to evaluate time expression: ${expr}`);
    }
  }
  
  // Return the value if found, otherwise return original expression
  // But if value is explicitly null (like user.pubkey when not logged in), return null
  return value !== undefined ? value : expr;
}

/**
 * Pure string processor - replaces {expressions} with values  
 * Extracted from renderer.tsx - zero React dependencies
 */
export function processString(str: string, ctx: RenderContext): string {
  return resolveVariables(str, {
    ...ctx.queryResults,
    ...ctx.extractedVariables,
    ...ctx.loopVariables, // Spread loop variables directly into context
    form: ctx.formData,
    user: { pubkey: ctx.userPubkey },
    target: ctx.target
  });
}