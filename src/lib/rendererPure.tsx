/**
 * Pure renderer functions extracted from renderer.tsx
 * No React hooks, no side effects - just pure rendering logic
 * Accepts componentRenderer callback to handle stateful components
 */

import React from 'react';
import { applyPipes, resolveVariables, resolveObjectVariables } from './pipes';

// Re-export types for convenience
export interface RenderContext {
  // Data
  queryResults: Record<string, any>;
  extractedVariables: Record<string, any>;
  formData: Record<string, string>;
  events: Record<string, any>;
  userPubkey: string | null;
  
  // Current scope
  loopVariables: Record<string, any>;
  target?: any; // For components with kind: 0 or 1
  
  // Component support
  resolver?: any;
  depth: number;
  
  // Loading hints
  loadingQueries?: Set<string>; // Which queries are still loading
  
  // Callbacks (pure functions passed from parent)
  onFormSubmit: (eventName: string) => void;
  onInputChange: (name: string, value: string) => void;
}

export interface HypernoteElement {
  type: string;
  content?: string[] | HypernoteElement[];
  elementId?: string;
  event?: string;
  elements?: HypernoteElement[];
  attributes?: Record<string, string>;
  name?: string;
  source?: string;
  variable?: string;
  style?: Record<string, any>; // CSS-in-JS style object
  condition?: string;
  alias?: string;
  argument?: string;
}

// Type for component renderer callback
export type ComponentRenderer = (element: HypernoteElement, ctx: RenderContext) => React.ReactNode;

/**
 * Single pure function for ALL variable resolution
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

/**
 * Pure content renderer - handles mixed string/element arrays
 */
export function renderContent(content: any[] | undefined, ctx: RenderContext, componentRenderer?: ComponentRenderer): React.ReactNode[] {
  if (!content) return [];
  
  return content.map((item, i) => {
    if (typeof item === 'string') {
      return processString(item, ctx);
    }
    return <React.Fragment key={i}>{renderElement(item, ctx, componentRenderer)}</React.Fragment>;
  });
}

/**
 * Pure element renderer - main rendering logic
 * Accepts componentRenderer callback to handle stateful components
 */
export function renderElement(element: HypernoteElement, ctx: RenderContext, componentRenderer?: ComponentRenderer): React.ReactNode {
  const props = {
    id: element.elementId,
    style: element.style || {}
  };

  // Text elements with content array
  if (['h1', 'h2', 'h3', 'p', 'strong', 'em', 'code'].includes(element.type)) {
    return React.createElement(
      element.type,
      props,
      renderContent(element.content, ctx, componentRenderer)
    );
  }

  // Container elements with children
  if (['div', 'span'].includes(element.type)) {
    return React.createElement(
      element.type,
      props,
      <>
        {/* Render content if present */}
        {element.content && renderContent(element.content, ctx, componentRenderer)}
        {/* Then render child elements */}
        {element.elements?.map((child, i) => 
          <React.Fragment key={i}>{renderElement(child, ctx, componentRenderer)}</React.Fragment>
        )}
      </>
    );
  }

  // Special elements
  switch (element.type) {
    case 'form':
      return (
        <form
          {...props}
          onSubmit={(e) => {
            e.preventDefault();
            if (element.event) {
              ctx.onFormSubmit(element.event);
            }
          }}
        >
          {element.elements?.map((child, i) => 
            <React.Fragment key={i}>{renderElement(child, ctx, componentRenderer)}</React.Fragment>
          )}
        </form>
      );

    case 'button':
      return (
        <button {...props} type="submit">
          {element.elements?.map((child, i) => 
            <React.Fragment key={i}>{renderElement(child, ctx, componentRenderer)}</React.Fragment>
          )}
        </button>
      );

    case 'input':
      const name = element.attributes?.name || '';
      const inputType = element.attributes?.type || 'text';
      const defaultValue = element.attributes?.value || '';
      
      // For hidden inputs, set the value immediately if not already set
      if (inputType === 'hidden' && name && !ctx.formData[name]) {
        // Use a setTimeout to avoid updating state during render
        setTimeout(() => ctx.onInputChange(name, defaultValue), 0);
      }
      
      return (
        <input
          {...props}
          type={inputType}
          name={name}
          placeholder={element.attributes?.placeholder || ''}
          value={ctx.formData[name] || defaultValue}
          onChange={(e) => ctx.onInputChange(name, e.target.value)}
        />
      );

    case 'img':
      const src = processString(element.attributes?.src || '', ctx);
      const alt = processString(element.attributes?.alt || '', ctx);
      
      // Check if src contains unresolved variables (still has braces)
      const hasUnresolvedVars = src.includes('{') && src.includes('}');
      
      if (!src || hasUnresolvedVars) {
        // Show placeholder while variables are resolving
        return (
          <div style={{
            ...props.style,
            padding: '1rem', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '0.25rem', 
            color: '#6b7280', 
            fontSize: '0.875rem',
            minHeight: '100px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {hasUnresolvedVars ? '🖼️ Loading image...' : `[Image: ${alt || 'No image available'}]`}
          </div>
        );
      }
      
      return <img {...props} src={src} alt={alt} />;

    case 'loop':
      return renderLoop(element, ctx, componentRenderer);
    
    case 'if':
      return renderIf(element, ctx, componentRenderer);

    case 'json':
      return renderJson(element, ctx);

    case 'component':
      // Delegate to component renderer callback
      if (componentRenderer) {
        return componentRenderer(element, ctx);
      }
      // Fallback error if no component renderer provided
      console.warn('Component rendering requires componentRenderer callback');
      return <div style={{ color: 'red' }}>Component rendering error</div>;

    default:
      // Unknown element type - render children if any
      return (
        <div {...props}>
          {element.elements?.map((child, i) => 
            <React.Fragment key={i}>{renderElement(child, ctx, componentRenderer)}</React.Fragment>
          )}
        </div>
      );
  }
}

/**
 * Pure conditional renderer
 */
export function renderIf(element: HypernoteElement & { condition?: string }, ctx: RenderContext, componentRenderer?: ComponentRenderer): React.ReactNode {
  const condition = element.condition || '';
  
  // Check if condition starts with ! for negation
  const isNegated = condition.startsWith('!');
  const cleanCondition = isNegated ? condition.slice(1).trim() : condition;
  
  // Check for equality comparison
  let isTruthy = false;
  if (cleanCondition.includes(' == ')) {
    // Handle equality comparison
    const [leftExpr, rightExpr] = cleanCondition.split(' == ').map(s => s.trim());
    const leftValue = resolveExpression(leftExpr, ctx);
    const rightValue = resolveExpression(rightExpr, ctx);
    
    // Remove quotes from string literals for comparison
    const cleanRight = rightExpr.startsWith('"') && rightExpr.endsWith('"') 
      ? rightExpr.slice(1, -1) 
      : rightValue;
    
    isTruthy = leftValue == cleanRight;
  } else {
    // Evaluate as truthy/falsy expression
    const value = resolveExpression(cleanCondition, ctx);
    
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
        <React.Fragment key={i}>{renderElement(child, ctx, componentRenderer)}</React.Fragment>
      )}
    </div>
  );
}

/**
 * Pure loop renderer
 */
export function renderLoop(element: HypernoteElement, ctx: RenderContext, componentRenderer?: ComponentRenderer): React.ReactNode {
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
      data = resolveExpression(source, ctx);
    } else {
      // Direct query result
      data = ctx.queryResults[source];
      isLoading = ctx.loadingQueries?.has(source);
    }
  } else {
    // Try to resolve as an expression
    data = resolveExpression(source, ctx);
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
                <React.Fragment key={j}>{renderElement(child, loopCtx, componentRenderer)}</React.Fragment>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/**
 * Pure JSON renderer
 */
export function renderJson(element: HypernoteElement, ctx: RenderContext): React.ReactNode {
  const variablePath = element.attributes?.variable || '$data';
  
  // Extract the variable name from the path
  let data;
  if (variablePath.startsWith('$')) {
    // It's a query result
    data = ctx.queryResults[variablePath] || ctx.extractedVariables[variablePath.slice(1)];
  } else {
    // It's some other context variable  
    data = resolveExpression(variablePath, ctx);
  }
  
  return (
    <pre style={{ 
      backgroundColor: '#f5f5f5', 
      padding: '0.5rem', 
      borderRadius: '0.25rem',
      fontSize: '0.8rem',
      overflow: 'auto',
      ...element.style 
    }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}