import React, { useState, useMemo, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { RelayHandler } from './lib/relayHandler';
import { compileHypernoteToContent } from './lib/compiler';
import { useNostrStore } from './stores/nostrStore';
import { useAuthStore } from './stores/authStore';
import { useNostrSubscription } from './lib/snstr/hooks';
import { useQueryExecution } from './hooks/useQueryExecution';
import type { Hypernote, AnyElement } from './lib/schema';
import { toast } from 'sonner';
import { applyPipeOperation } from './lib/jq-parser';
import type { NostrEvent } from './lib/snstr/nip07';

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

  // Compile markdown to content object - memoize to prevent unnecessary recompilation
  const content: Hypernote = useMemo(
    () => compileHypernoteToContent(debouncedMarkdown || ''),
    [debouncedMarkdown]
  );
  
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
  
  // Memoize queries based on their hash to prevent unnecessary re-fetches
  const memoizedQueries = useMemo(() => {
    console.log('[Renderer] Using memoized queries with hash:', queriesHash.substring(0, 16) + '...');
    return content.queries || {};
  }, [queriesHash]);
  
  // Execute all queries with dependency resolution
  const { queryResults, extractedVariables, loading: queriesLoading, error: queryError } = useQueryExecution(
    memoizedQueries
  );
  
  // Debug: Log when queryResults changes
  useEffect(() => {
    console.log('[Renderer] queryResults changed:', Object.keys(queryResults).map(k => `${k}: ${queryResults[k]?.length} items`));
  }, [queryResults]);
  
  // Get auth store for NIP-07 signing
  const { isAuthenticated, signEvent, login } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
  // Process form submission with NIP-07 signing
  const handleFormSubmit = async (eventName: string) => {
    if (!eventName) {
      console.log('Form submitted but no event is specified');
      return;
    }
    
    if (!content.events || !content.events[eventName]) {
      console.error(`Event ${eventName} not found`);
      return;
    }
    
    // Check if user is authenticated
    if (!isAuthenticated) {
      toast.error('Please connect NIP-07 to publish events');
      // Optionally trigger login
      login();
      return;
    }
    
    if (!snstrClient) {
      toast.error('Relay client not initialized');
      return;
    }
    
    const eventTemplate = content.events[eventName];
    
    // Process template variables
    let eventContent = eventTemplate.content;
    if (typeof eventContent === 'string' && eventContent.includes('{form.')) {
      // Replace {form.fieldName} with actual form values
      Object.keys(formData).forEach(key => {
        eventContent = eventContent.replace(`{form.${key}}`, formData[key] || '');
      });
    }
    
    // Create event template for signing
    const unsignedEvent = {
      kind: eventTemplate.kind,
      content: eventContent,
      tags: eventTemplate.tags || [],
      created_at: Math.floor(Date.now() / 1000)
    };
    
    // Sign and publish the event
    try {
      // Sign with NIP-07
      const signedEvent = await signEvent(unsignedEvent);
      
      // Publish to relays
      const result = await snstrClient.publishEvent(signedEvent);
      
      console.log(`Published event: ${result.eventId} to ${result.successCount} relays`);
      toast.success(`Event published to ${result.successCount} relays!`);
      
      // Reset form if successful
      setFormData({});
      
      // No need to invalidate - subscriptions are reactive and will auto-update!
    } catch (error) {
      console.error(`Failed to publish event: ${error}`);
      toast.error(`Failed to publish: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
  const content: Hypernote = useMemo(
    () => {
      if (!debouncedMarkdown || typeof debouncedMarkdown !== 'string') {
        return { elements: [], style: {} } as Hypernote;
      }
      return compileHypernoteToContent(debouncedMarkdown);
    },
    [debouncedMarkdown]
  );
  
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
  // Priority order (first match wins):
  // 1. Loop variables: $item.field
  // 2. Query results: $queryName.field  
  // 3. Extracted variables: extractedVarName
  // 4. Form fields: form.fieldName
  // 5. User context: user.pubkey
  // 6. Time: time.now
  // 7. Return original if no match
  
  if (expr.startsWith('$')) {
    // Handle $varName or $varName.field
    const [varName, ...path] = expr.split('.');
    
    // Check loop variables first
    let variable = ctx.loopVariables[varName];
    
    // If not in loop variables, check query results
    if (!variable && ctx.queryResults[varName]) {
      const queryData = ctx.queryResults[varName];
      // If it's an array, automatically take the first item
      variable = Array.isArray(queryData) && queryData.length > 0 ? queryData[0] : queryData;
    }
    
    if (variable) {
      // Access nested properties
      if (path.length > 0) {
        const result = path.reduce((obj, prop) => obj?.[prop], variable);
        return result !== undefined && result !== null ? result : '';
      }
      return variable;
    }
  }
  
  if (expr.startsWith('form.')) {
    return ctx.formData[expr.slice(5)] || '';
  }
  
  if (expr === 'user.pubkey') {
    return ctx.userPubkey || '';
  }
  
  if (expr === 'time.now') {
    return Date.now();
  }
  
  // Handle time expressions like "time.now - 86400000"
  if (expr.includes('time.now')) {
    try {
      const timeNow = Date.now();
      const result = expr.replace(/time\.now/g, timeNow.toString());
      return new Function('return ' + result)();
    } catch (e) {
      console.warn(`Failed to evaluate time expression: ${expr}`);
      return expr;
    }
  }
  
  if (ctx.extractedVariables[expr]) {
    return ctx.extractedVariables[expr];
  }
  
  return expr;
}

// Pure string processor - replaces {expressions} with values
function processString(str: string, ctx: RenderContext): string {
  return str.replace(/\{([^}]+)\}/g, (_, expr) => 
    String(resolveExpression(expr, ctx))
  );
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
  if (['h1', 'h2', 'h3', 'p', 'strong', 'em'].includes(element.type)) {
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
      return (
        <input
          {...props}
          name={name}
          placeholder={element.attributes?.placeholder || ''}
          value={ctx.formData[name] || ''}
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

    case 'json':
      return renderJson(element, ctx);

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
function renderLoop(element: HypernoteElement, ctx: RenderContext): React.ReactNode {
  const source = element.source || '';
  const data = ctx.queryResults[source];
  const varName = element.variable || '$item';
  const isLoading = ctx.loadingQueries?.has(source);
  
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
            <div key={item.id || i}>
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

// Pure JSON renderer
function renderJson(element: HypernoteElement, ctx: RenderContext): React.ReactNode {
  const variablePath = element.attributes?.variable || '$data';
  
  let actualData: any;
  
  if (variablePath.includes('.')) {
    const [varName, ...propertyPath] = variablePath.split('.');
    
    // Check loop variables first
    let baseData = ctx.loopVariables[varName];
    
    // If not in loop variables, check query results
    if (baseData === undefined && ctx.queryResults[varName]) {
      baseData = ctx.queryResults[varName];
    }
    
    if (baseData !== undefined) {
      actualData = propertyPath.reduce((obj, prop) => obj?.[prop], baseData);
    }
  } else {
    // Simple variable reference
    actualData = ctx.loopVariables[variablePath] ?? ctx.queryResults[variablePath];
  }
  
  let displayContent: string;
  
  if (actualData !== undefined) {
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