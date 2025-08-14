import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { RelayHandler } from './lib/relayHandler';
import { safeCompileHypernote } from './lib/safe-compiler';
import { useNostrStore } from './stores/nostrStore';
import { useAuthStore } from './stores/authStore';
import { useNostrSubscription } from './lib/snstr/hooks';
import { useQueryExecution } from './hooks/useQueryExecution';
import { useActionExecution } from './hooks/useActionExecution';
import type { Hypernote, AnyElement } from './lib/schema';
import { toast } from 'sonner';
import { applyPipeOperation } from './lib/jq-parser';
import type { NostrEvent } from './lib/snstr/nip07';
import { ComponentResolver, parseTarget, type TargetContext } from './lib/componentResolver';
import { nip19 } from 'nostr-tools';
import { applyPipes, resolveVariables, resolveObjectVariables } from './lib/pipes';

// Pure render context - all data needed for rendering
interface RenderContext {
  // Data
  queryResults: Record<string, NostrEvent[]>;
  extractedVariables: Record<string, any>;
  formData: Record<string, string>;
  events: Record<string, any>;
  userPubkey: string | null;
  
  // Current scope
  loopVariables: Record<string, any>;
  target?: TargetContext; // For components with kind: 0 or 1
  
  // Component support
  resolver?: ComponentResolver;
  imports?: Record<string, string>;
  depth: number;
  
  // Loading hints
  loadingQueries?: Set<string>; // Which queries are still loading
  
  // Callbacks (pure functions passed from parent)
  onFormSubmit: (eventName: string) => void;
  onInputChange: (name: string, value: string) => void;
  
}

// Define the structure of elements based on compiler output
interface HypernoteElement {
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
}

// (Old RendererProps interface removed - using RenderContext instead)

// (Old ElementRenderer removed - using pure render functions below)
export function HypernoteRenderer({ markdown, relayHandler }: { markdown: string, relayHandler: RelayHandler }) {
  // Debounce the markdown input to prevent re-rendering on every keystroke
  const [debouncedMarkdown] = useDebounce(markdown || '', 300);

  // Compile markdown to content object safely - memoize to prevent unnecessary recompilation
  const compileResult = useMemo(
    () => safeCompileHypernote(debouncedMarkdown || ''),
    [debouncedMarkdown]
  );

  // Show error banner if compilation failed but we have stale data
  const content = compileResult.data;
  const error = compileResult.error;

  // Just render the content - errors are shown in the JSON output area
  return <RenderHypernoteContent content={content} />;
}

// New: Render from compiled Hypernote JSON directly
export function RenderHypernoteContent({ content }: { content: Hypernote }) {
  // Get SNSTR client from store
  const { snstrClient } = useNostrStore();

  // Set up component resolver
  const resolverRef = useRef<ComponentResolver | undefined>(undefined);
  const [componentsLoaded, setComponentsLoaded] = useState(false);

  // Create imports hash for stable dependency tracking
  const importsHash = useMemo(() => {
    if (!content.imports) return '';
    return JSON.stringify(content.imports);
  }, [content.imports]);

  // Prefetch all imported components
  useEffect(() => {
    const loadComponents = async () => {
      if (content.imports && Object.keys(content.imports).length > 0) {
        // Wait for snstrClient to be available
        if (!snstrClient) {
          console.log('[Renderer] Waiting for SNSTRClient to initialize...');
          return;
        }

        // Reuse existing resolver if possible
        let resolver = resolverRef.current;
        if (!resolver) {
          console.log('[Renderer] Creating new ComponentResolver');
          resolver = new ComponentResolver(snstrClient);
          resolverRef.current = resolver;
        } else {
          console.log('[Renderer] Reusing existing ComponentResolver');
        }

        try {
          console.log('[Renderer] Loading imported components');
          await resolver.prefetchComponents(content.imports);
          setComponentsLoaded(true);
        } catch (error) {
          console.error('[Renderer] Failed to load components:', error);
          setComponentsLoaded(true); // Set loaded even on error to prevent infinite loading
        }
      } else {
        setComponentsLoaded(true);
      }
    };
    loadComponents();
  }, [importsHash, snstrClient]);

  // Set up form data state
  const [formData, setFormData] = useState<Record<string, string>>({});

  // Get user pubkey from auth store (NIP-07)
  const { pubkey } = useAuthStore();

  const userContext = { pubkey };

  // Create a hash of the queries to detect actual changes
  const [queriesHash, setQueriesHash] = useState<string>('');

  useEffect(() => {
    const hashQueries = async () => {
      const queriesJson = JSON.stringify(content.queries || {});
      const encoder = new TextEncoder();
      const data = encoder.encode(queriesJson);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('[Renderer] Queries hash:', hashHex.substring(0, 16) + '...');
      setQueriesHash(hashHex);
    };
    hashQueries();
  }, [content.queries]);

  // Track published event IDs for action outputs (@action.id references)
  const [publishedEventIds, setPublishedEventIds] = useState<Record<string, string>>({});

  // Memoize queries based on their hash to prevent unnecessary re-fetches
  const memoizedQueries = useMemo(() => {
    console.log('[Renderer] Render cycle triggered');
    return content.queries || {};
  }, [queriesHash]);

  // Use a ref to hold the action executor so queries can trigger it
  const executeActionRef = useRef<(actionName: string) => Promise<void> | void>(() => {});

  // Memoize the onTriggerAction callback to prevent re-renders
  const onTriggerAction = useCallback((actionName: string) => {
    console.log(`[Renderer] Triggering action from query: "${actionName}"`);
    if (executeActionRef.current) {
      executeActionRef.current(actionName);
    }
  }, []); // Empty deps since we use a ref

  // Memoize the query execution options to prevent re-executions
  const queryExecutionOptions = useMemo(() => ({
    actionResults: publishedEventIds,
    onTriggerAction
  }), [publishedEventIds, onTriggerAction]);

  // Execute all queries with dependency resolution
  const { queryResults, extractedVariables, loading: queriesLoading, error: queryError } = useQueryExecution(
    memoizedQueries, 
    queryExecutionOptions
  );

  // Debug: Log when queryResults changes
  // useEffect(() => {
  //   console.log('[Renderer] queryResults changed:', Object.keys(queryResults).map(k => `${k}: ${queryResults[k]?.length} items`));
  // }, [queryResults]);

  // Use the clean action execution hook with query results
  const { executeAction } = useActionExecution({
    events: content.events,
    queryResults: queryResults || {},
    formData,
    onActionPublished: (actionName, eventId) => {
      setPublishedEventIds(prev => ({
        ...prev,
        [actionName]: eventId
      }));
    }
  });

  // Store the executeAction in ref so queries can use it
  executeActionRef.current = executeAction;

  // Simple wrapper for form submission
  const handleFormSubmit = (eventName: string) => {
    if (!eventName) {
      console.log('Form submitted but no event is specified');
      return;
    }
    executeAction(eventName);
  };

  // Handle input changes in forms
  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Don't block on loading - render progressively!
  // Queries will populate as they resolve

  // If there are no elements, show an empty container (allow editing)
  if (!content.elements || content.elements.length === 0) {
    return (
      <div className="hypernote-content" style={content.style || {}}>
        {/* Empty but editable */}
      </div>
    );
  }

  // Get the root-level styles from the hypernote
  const rootStyles = content.style || {};

  // Determine theme class based on background color or explicit class
  let themeClass = '';
  if (rootStyles.backgroundColor === 'rgb(0,0,0)' || rootStyles.backgroundColor === '#000000' || rootStyles.backgroundColor === 'black') {
    themeClass = 'hypernote-dark';
  }

  // Build context for pure renderer
  // Track which queries are still loading
  const loadingQueries = new Set<string>();
  if (queriesLoading && content.queries) {
    // If we're still loading, check which queries don't have results yet
    Object.keys(content.queries).forEach(queryName => {
      if (!queryResults[queryName]) {
        loadingQueries.add(queryName);
      }
    });
  }

  const context: RenderContext = {
    queryResults: queryResults || {},  // Empty initially, populates progressively
    extractedVariables: extractedVariables || {},
    formData,
    events: content.events || {},
    userPubkey: pubkey,
    loopVariables: {},
    resolver: resolverRef.current,
    imports: content.imports,
    depth: 0,
    loadingQueries,
    onFormSubmit: handleFormSubmit,
    onInputChange: handleInputChange
  };

  // Show error banner if there was a query error, but still render the page
  const errorBanner = queryError ? (
    <div style={{ backgroundColor: '#fee', color: '#c00', padding: '10px', marginBottom: '10px', borderRadius: '4px' }}>
      ⚠️ Some data failed to load: {queryError.message}
    </div>
  ) : null;

  // Render the content
  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      {errorBanner}
      <div 
        className={`hypernote-content ${themeClass}`.trim()} 
        style={rootStyles as React.CSSProperties}
      >
        {content.elements.map((element, index) => (
          <React.Fragment key={index}>
            {renderElement(element, context)}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

// Component to output the compiled JSON from markdown
export function HypernoteJsonOutput({ markdown }: { markdown: string }) {
  // Debounce the markdown input to match the renderer
  const [debouncedMarkdown] = useDebounce(markdown, 300);
  
  // Memoize the compilation to prevent unnecessary recompilation
  // Use empty string fallback to ensure hooks are always called
  const compileResult = useMemo(
    () => {
      if (!debouncedMarkdown || typeof debouncedMarkdown !== 'string') {
        return { success: true, data: { elements: [], style: {} } as Hypernote };
      }
      return safeCompileHypernote(debouncedMarkdown);
    },
    [debouncedMarkdown]
  );
  
  // If compilation failed, show error in the JSON area
  if (!compileResult.success && compileResult.error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-4 rounded overflow-auto">
        <div className="font-bold mb-2">⚠️ Syntax Error</div>
        <div className="font-mono">{compileResult.error.message}</div>
        {compileResult.error.line && compileResult.error.column && (
          <div className="text-red-500 mt-1">Line {compileResult.error.line}, Column {compileResult.error.column}</div>
        )}
        {compileResult.isStale && (
          <div className="text-orange-600 mt-2 text-xs">Showing last valid JSON below:</div>
        )}
        {compileResult.isStale && (
          <pre className="mt-2 bg-white p-2 rounded border border-red-100">
            {JSON.stringify(compileResult.data, null, 2)}
          </pre>
        )}
      </div>
    );
  }
  
  const content = compileResult.data;
  
  return (
    <pre className="bg-slate-100 text-green-900 text-xs p-4 rounded overflow-auto">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

// ============================================================================
// PURE RENDERER FUNCTIONS - No hooks, no side effects
// ============================================================================

// Single pure function for ALL variable resolution
function resolveExpression(expr: string, ctx: RenderContext): any {
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

// Pure string processor - replaces {expressions} with values  
function processString(str: string, ctx: RenderContext): string {
  return resolveVariables(str, {
    ...ctx.queryResults,
    ...ctx.extractedVariables,
    ...ctx.loopVariables, // Spread loop variables directly into context
    form: ctx.formData,
    user: { pubkey: ctx.userPubkey },
    target: ctx.target
  });
}

// Pure content renderer - handles mixed string/element arrays
function renderContent(content: any[] | undefined, ctx: RenderContext): React.ReactNode[] {
  if (!content) return [];
  
  return content.map((item, i) => {
    if (typeof item === 'string') {
      return processString(item, ctx);
    }
    return <React.Fragment key={i}>{renderElement(item, ctx)}</React.Fragment>;
  });
}

// Pure element renderer - main rendering logic
function renderElement(element: HypernoteElement, ctx: RenderContext): React.ReactNode {
  const props = {
    id: element.elementId,
    style: element.style || {}
  };

  // Text elements with content array
  if (['h1', 'h2', 'h3', 'p', 'strong', 'em', 'code'].includes(element.type)) {
    return React.createElement(
      element.type,
      props,
      renderContent(element.content, ctx)
    );
  }

  // Container elements with children
  if (['div', 'span'].includes(element.type)) {
    return React.createElement(
      element.type,
      props,
      element.elements?.map((child, i) => 
        <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
      )
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
            <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
          )}
        </form>
      );

    case 'button':
      return (
        <button {...props} type="submit">
          {element.elements?.map((child, i) => 
            <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
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
      return renderLoop(element, ctx);
    
    case 'if':
      return renderIf(element, ctx);

    case 'json':
      return renderJson(element, ctx);

    case 'component':
      return <ComponentWrapper element={element} ctx={ctx} />;

    default:
      // Unknown element type - render children if any
      return (
        <div {...props}>
          {element.elements?.map((child, i) => 
            <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
          )}
        </div>
      );
  }
}

// Pure loop renderer
function renderIf(element: HypernoteElement & { condition?: string }, ctx: RenderContext): React.ReactNode {
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
        <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
      )}
    </div>
  );
}

function renderLoop(element: HypernoteElement, ctx: RenderContext): React.ReactNode {
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
                <React.Fragment key={j}>{renderElement(child, loopCtx)}</React.Fragment>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// Component wrapper that handles loading target context
function ComponentWrapper({ element, ctx }: { element: HypernoteElement & { alias?: string; argument?: string }, ctx: RenderContext }) {
  const alias = element.alias || 'unknown';
  const argument = element.argument || '';
  
  // Prevent nested components (max depth = 1)
  if (ctx.depth > 0) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Error: Components cannot include other components (max depth: 1)
      </div>
    );
  }
  
  // Check if resolver is available
  if (!ctx.resolver) {
    return (
      <div style={{ color: '#f59e0b', padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '0.25rem' }}>
        ⚠️ Components not loaded yet...
      </div>
    );
  }
  
  // Get cached component definition
  const componentDef = ctx.resolver.getComponent(alias);
  if (!componentDef) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Unknown component: #{alias}
      </div>
    );
  }
  
  // Validate component has kind field
  if (componentDef.kind === undefined) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Component #{alias} is not a valid component (missing kind field)
      </div>
    );
  }
  
  // Resolve the argument to get npub/nevent value
  // Component arguments work like [json $variable] - no braces needed
  // Use useMemo to ensure it updates when relevant context changes
  const resolvedArgument = useMemo(() => {
    const resolved = argument.startsWith('{') && argument.endsWith('}') 
      ? processString(argument, ctx)  // Has braces, use processString
      : String(resolveExpression(argument, ctx));  // No braces, resolve directly
    
    // console.log(`[Component] Resolving argument for ${alias}: "${argument}" -> "${resolved}"`);
    // console.log(`[Component] Component def kind: ${componentDef.kind}`);
    return resolved;
  }, [argument, ctx.loopVariables, ctx.queryResults, ctx.extractedVariables, ctx.userPubkey, alias, componentDef.kind]);
  
  // Parse target context from the argument
  const [targetContext, setTargetContext] = useState<TargetContext | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetError, setTargetError] = useState<string | null>(null);
  const { snstrClient: componentSnstrClient } = useNostrStore();
  
  // Pre-resolved queries for ANY component with target data
  // MUST be called before any conditional returns to maintain hook order
  const preResolvedQueries = useMemo(() => {
    const queries: Record<string, any> = {};
    
    // If we have target context with actual data, provide it to the component
    // This works for ANY kind of component, not just profiles
    if (targetContext && Object.keys(targetContext).length > 1) { // More than just 'raw'
      // The component can reference this data however it needs
      // For kind:0 it might use target.name, target.picture
      // For kind:1 it might use target.content, target.created_at
      // etc.
      
      // For now, keep the simple heuristic but make it extensible
      if (componentDef.kind === 0 && targetContext.name) {
        queries['$profile'] = {
          name: targetContext.name,
          picture: targetContext.picture,
          nip05: targetContext.nip05
        };
      } else if (componentDef.kind === 1 && targetContext.content) {
        queries['$note'] = targetContext;
      }
      // Add more patterns as needed
    }
    
    return queries;
  }, [componentDef.kind, targetContext]);
  
  useEffect(() => {
    const loadTarget = async () => {
      if (!resolvedArgument) {
        setTargetError('No argument provided');
        setTargetLoading(false);
        return;
      }
      
      // Skip if the resolved argument looks invalid
      // Check for actual null/undefined values or string representations
      if (resolvedArgument === 'undefined' || resolvedArgument === 'null' || 
          resolvedArgument === '' || resolvedArgument === null || 
          resolvedArgument === undefined || resolvedArgument === 'user.pubkey') {
        console.log(`[Component] Waiting for valid argument for ${alias} - current: "${resolvedArgument}"`);
        setTargetError('Waiting for data...');
        setTargetLoading(false);
        // Clear any previous target context when waiting
        setTargetContext(null);
        return;
      }
      
      try {
        setTargetLoading(true);
        setTargetError(null);
        
        console.log(`[Component] Loading target for ${alias} with argument: ${resolvedArgument}`);
        
        // Parse the target based on component kind
        const target = await parseTarget(resolvedArgument, componentDef.kind as (0 | 1), componentSnstrClient || undefined);
        console.log(`[Component] Parsed target for ${alias}:`, target);
        setTargetContext(target);
      } catch (error) {
        console.error(`Failed to parse target for component ${alias}:`, error);
        setTargetError(error.message);
      } finally {
        setTargetLoading(false);
      }
    };
    
    loadTarget();
  }, [resolvedArgument, componentDef.kind, componentSnstrClient, alias]);
  
  // Show loading state
  if (targetLoading) {
    return (
      <div style={{ 
        padding: '0.5rem', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '0.25rem',
        ...element.style 
      }}>
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading component...</div>
      </div>
    );
  }
  
  // Show error state
  if (targetError) {
    // Special handling for "waiting for data" state
    if (targetError === 'Waiting for data...') {
      return (
        <div style={{ 
          color: '#6b7280', 
          padding: '0.5rem', 
          backgroundColor: '#f3f4f6', 
          borderRadius: '0.25rem',
          ...element.style 
        }}>
          <div style={{ fontSize: '0.875rem' }}>Waiting for authentication...</div>
        </div>
      );
    }
    
    return (
      <div style={{ 
        color: '#ef4444', 
        padding: '0.5rem', 
        border: '1px solid #ef4444', 
        borderRadius: '0.25rem',
        ...element.style 
      }}>
        ⚠️ Component error: {targetError}
      </div>
    );
  }
  
  // Don't render component until target is ready (prevents bad queries)
  if (!targetContext) {
    return (
      <div style={{ 
        padding: '0.5rem', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '0.25rem',
        ...element.style 
      }}>
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading component data...</div>
      </div>
    );
  }
  
  // Create component context - keep callbacks from parent
  const componentCtx: RenderContext = {
    ...ctx,
    target: targetContext,
    depth: ctx.depth + 1,
    // Reset loop variables for component scope
    loopVariables: {},
    // Pre-populate with any resolved data to skip redundant queries
    queryResults: preResolvedQueries,
    extractedVariables: {},
    loadingQueries: new Set()
  };
  
  // Check if we need to execute queries
  const hasPrePopulatedData = preResolvedQueries && Object.keys(preResolvedQueries).length > 0;
  const hasQueries = componentDef.queries && Object.keys(componentDef.queries).length > 0;
  
  // Skip query execution if we have pre-populated data (prevents infinite loops)
  if (hasPrePopulatedData || !hasQueries) {
    // Directly render with pre-populated or no data
    return (
      <div id={element.elementId} style={element.style}>
        {componentDef.elements?.map((el, i) => (
          <React.Fragment key={i}>
            {renderElement(el as HypernoteElement, componentCtx)}
          </React.Fragment>
        ))}
      </div>
    );
  }
  
  // Only execute queries if needed
  const queryOptions = useMemo(() => ({
    target: targetContext,
    parentExtracted: ctx.extractedVariables
  }), [targetContext, ctx.extractedVariables]);
  
  const { queryResults, extractedVariables, loading: queriesLoading } = useQueryExecution(
    componentDef.queries || {},
    queryOptions
  );
  
  // Update context with query results
  const finalCtx: RenderContext = {
    ...componentCtx,
    queryResults: { ...preResolvedQueries, ...queryResults },
    extractedVariables,
    loadingQueries: queriesLoading ? new Set(Object.keys(componentDef.queries || {})) : new Set()
  };
  
  // Render component with query results
  return (
    <div id={element.elementId} style={element.style}>
      {componentDef.elements?.map((el, i) => (
        <React.Fragment key={i}>
          {renderElement(el as HypernoteElement, finalCtx)}
        </React.Fragment>
      ))}
    </div>
  );
}

// Pure component renderer - renders embedded hypernote components
function renderComponent(element: HypernoteElement & { alias?: string; argument?: string }, ctx: RenderContext): React.ReactNode {
  return <ComponentWrapper element={element} ctx={ctx} />;
}

// Pure JSON renderer
function renderJson(element: HypernoteElement, ctx: RenderContext): React.ReactNode {
  const variablePath = element.attributes?.variable || '$data';
  
  // Use the unified resolver!
  const actualData = resolveExpression(variablePath, ctx);
  
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