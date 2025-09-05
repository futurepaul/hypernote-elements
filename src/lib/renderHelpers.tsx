/**
 * Pure helper functions extracted from renderer.tsx
 * Zero React dependencies - safe to extract
 */

import { resolveVariables } from './pipes';
import { resolveTimeExpression } from './core/clock';
import type { Clock } from './services';

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
 * Now accepts injected clock for safe time expressions
 */
export function resolveExpression(expr: string, ctx: RenderContext, clock?: Clock): any {
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
  
  // ✅ SAFE: Time expressions with injected clock (no dangerous eval!)
  if (value === undefined && expr.includes('time.now') && clock) {
    const timeResult = resolveTimeExpression(expr, clock);
    if (timeResult !== undefined) {
      return timeResult;
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

// ============================================================================
// PURE RENDERER FUNCTIONS - Extracted from renderer.tsx
// ============================================================================

// Import React for JSX
import React from 'react';

// Pure loop renderer - takes renderElement as parameter to avoid circular imports
export function renderLoop(
  element: any, 
  ctx: any, 
  renderElement: (element: any, ctx: any) => React.ReactNode
): React.ReactNode {
  const source = element.source || '';
  const varName = element.variable || '$item';
  
  // Check if source is a query result or a nested field
  let data;
  let isLoading = false;
  
  if (source.startsWith('$')) {
    // Check if it's a loop variable first
    if (ctx.loopVariables && ctx.loopVariables[source]) {
      data = ctx.loopVariables[source];
    } else if (source.includes('.')) {
      // Nested field access like $board_state.board
      data = resolveExpression(source, ctx, { now: () => Date.now() });
    } else {
      // Direct query result
      data = ctx.queryResults[source];
      isLoading = ctx.loadingQueries?.has(source);
    }
  } else {
    // Try to resolve as an expression
    data = resolveExpression(source, ctx, { now: () => Date.now() });
  }
  
  // Ensure data is an array
  if (data && !Array.isArray(data)) {
    data = [];
  }
  
  return (
    <div id={element.elementId} style={element.style}>
      {isLoading ? (
        // Show skeleton loader while query is loading
        <div style={{ padding: '1rem' }}>
          <div style={{ 
            backgroundColor: '#e2e8f0', 
            borderRadius: '0.25rem', 
            height: '1rem', 
            marginBottom: '0.5rem',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }} />
          <div style={{ 
            backgroundColor: '#e2e8f0', 
            borderRadius: '0.25rem', 
            height: '1rem', 
            width: '75%',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
          }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div style={{ color: '#6b7280', padding: '1rem' }}>No data found</div>
      ) : (
        data.map((item, i) => {
          const loopCtx = {
            ...ctx,
            loopVariables: { ...ctx.loopVariables, [varName]: item }
          };
          return (
            <div key={item?.id || i}>
              {element.elements?.map((child, j) => 
                <React.Fragment key={j}>{renderElement(child, loopCtx)}</React.Fragment>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// Pure conditional renderer - takes renderElement as parameter to avoid circular imports  
export function renderIf(
  element: any, 
  ctx: any,
  renderElement: (element: any, ctx: any) => React.ReactNode
): React.ReactNode {
  const condition = element.condition || '';
  
  // Check if condition starts with ! for negation
  const isNegated = condition.startsWith('!');
  const cleanCondition = isNegated ? condition.slice(1).trim() : condition;
  
  // Check for equality comparison
  let isTruthy = false;
  if (cleanCondition.includes(' == ')) {
    // Handle equality comparison
    const [leftExpr, rightExpr] = cleanCondition.split(' == ').map(s => s.trim());
    const leftValue = resolveExpression(leftExpr, ctx, { now: () => Date.now() });
    const rightValue = resolveExpression(rightExpr, ctx, { now: () => Date.now() });
    
    // Remove quotes from string literals for comparison
    const cleanRight = rightExpr.startsWith('"') && rightExpr.endsWith('"') 
      ? rightExpr.slice(1, -1) 
      : rightValue;
    
    isTruthy = leftValue == cleanRight;
  } else {
    // Evaluate as truthy/falsy expression
    const value = resolveExpression(cleanCondition, ctx, { now: () => Date.now() });
    
    // Determine truthiness
    if (value === undefined || value === null) {
      isTruthy = false;
    } else if (typeof value === 'boolean') {
      isTruthy = value;
    } else if (typeof value === 'string') {
      isTruthy = value.length > 0;
    } else if (typeof value === 'number') {
      isTruthy = value !== 0;
    } else if (Array.isArray(value)) {
      isTruthy = value.length > 0;
    } else if (typeof value === 'object') {
      isTruthy = Object.keys(value).length > 0;
    } else {
      isTruthy = !!value;
    }
  }
  
  // Apply negation if needed
  if (isNegated) {
    isTruthy = !isTruthy;
  }
  
  // Only render children if condition is truthy
  if (!isTruthy) {
    return null;
  }
  
  return (
    <div id={element.elementId} style={element.style}>
      {element.elements?.map((child, i) => 
        <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
      )}
    </div>
  );
}

// Pure JSON renderer - no circular import needed
export function renderJson(element: any, ctx: any): React.ReactNode {
  const variablePath = element.attributes?.variable || '$data';
  
  // Use the unified resolver!
  const actualData = resolveExpression(variablePath, ctx, { now: () => Date.now() });
  
  let displayContent: string;
  
  if (actualData !== undefined && actualData !== variablePath) {
    // resolveExpression returns the original expression if not found
    try {
      displayContent = JSON.stringify(actualData, null, 2);
    } catch (e) {
      displayContent = String(actualData);
    }
  } else {
    displayContent = `No data found for variable: ${variablePath}`;
  }
  
  return (
    <details id={element.elementId} style={element.style}>
      <summary style={{ cursor: 'pointer', padding: '0.5rem', backgroundColor: '#e2e8f0', borderRadius: '0.25rem', fontSize: '0.875rem' }}>
        {variablePath} (JSON)
      </summary>
      <pre style={{ backgroundColor: '#f1f5f9', padding: '1rem', borderRadius: '0.25rem', overflow: 'auto', fontSize: '0.75rem', lineHeight: '1rem', fontFamily: 'monospace', marginTop: '0.5rem' }}>
        {displayContent}
      </pre>
    </details>
  );
}