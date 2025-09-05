import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { RelayHandler } from './lib/relayHandler';
import { safeCompileHypernote } from './lib/safe-compiler';
// Store imports removed - using services injection instead
import { useNostrSubscription } from './lib/snstr/hooks';
// useHypernoteExecutor removed - using services.queryEngine instead
import type { Hypernote, AnyElement } from './lib/schema';
import { toast } from 'sonner';
// applyPipeOperation from jq-parser unused - using pipes.ts instead
import type { NostrEvent } from './lib/snstr/nip07';
import { ComponentResolver, parseTarget, type TargetContext } from './lib/componentResolver';
import { ComponentWrapper } from './components/ComponentWrapper';
import { nip19 } from 'nostr-tools';
import { applyPipes, resolveVariables, resolveObjectVariables } from './lib/pipes';
import { resolveExpression, processString, renderLoop, renderIf, renderJson } from './lib/renderHelpers';
import type { Services } from './lib/services';
import { deriveInitialFormData } from './lib/core/forms';
import { defaultClock } from './lib/services';

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
  depth: number;
  
  // Loading hints
  loadingQueries?: Set<string>; // Which queries are still loading
  
  // Services injection
  services?: Services;
  
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
export function HypernoteRenderer({ markdown, relayHandler, services }: { markdown: string, relayHandler: RelayHandler, services: Services }) {
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
  return <RenderHypernoteContent content={content} services={services} />;
}

// New: Render from compiled Hypernote JSON directly
export function RenderHypernoteContent({ content, services }: { content: Hypernote; services: Services }) {
  // Get SNSTR client from services
  const snstrClient = services.snstrClient;

  // Set up component resolver
  const resolverRef = useRef<ComponentResolver | undefined>(undefined);
  const [componentsLoaded, setComponentsLoaded] = useState(false);

  // Initialize component resolver for argument parsing
  useEffect(() => {
    if (snstrClient) {
      if (!resolverRef.current) {
        console.log('[Renderer] Creating ComponentResolver for argument parsing');
        resolverRef.current = new ComponentResolver(snstrClient);
      }
      setComponentsLoaded(true);
    } else {
      console.log('[Renderer] Waiting for SNSTRClient to initialize...');
    }
  }, [snstrClient]);

  // Set up form data state with pure derived initial values (no setTimeout!)
  const initialFormData = useMemo(() => deriveInitialFormData(content), [content]);
  const [formData, setFormData] = useState<Record<string, string>>(initialFormData);
  
  // Update form data when content changes
  useEffect(() => {
    setFormData(initialFormData);
  }, [initialFormData]);

  // Get user pubkey from services
  const pubkey = services.userPubkey;

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

  // Execute all queries with dependency resolution using services
  const [queryResults, setQueryResults] = useState<Record<string, any>>({});
  const [extractedVariables, setExtractedVariables] = useState<Record<string, any>>({});
  const [queriesLoading, setQueriesLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  
  useEffect(() => {
    const runQueriesWithServices = async () => {
      try {
        setQueriesLoading(true);
        setQueryError(null);
        
        const result = await services.queryEngine.runAll(content, queryExecutionOptions);
        setQueryResults(result.queryResults);
        setExtractedVariables(result.extractedVariables);
      } catch (err) {
        console.error('[Services] Query error:', err);
        setQueryError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setQueriesLoading(false);
      }
    };
    
    runQueriesWithServices();
  }, [services, queriesHash, queryExecutionOptions]);

  // Debug: Log when queryResults changes
  // useEffect(() => {
  //   console.log('[Renderer] queryResults changed:', Object.keys(queryResults).map(k => `${k}: ${queryResults[k]?.length} items`));
  // }, [queryResults]);

  // Action execution using services
  const executeAction = async (actionName: string) => {
    const eventId = await services.actionExecutor.execute(
      actionName,
      formData,
      content,
      {
        queryResults,
        extractedVariables,
        userPubkey: pubkey
      }
    );
    
    if (eventId) {
      setPublishedEventIds(prev => ({
        ...prev,
        [actionName]: eventId
      }));
    }
  };

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
    depth: 0,
    loadingQueries,
    services, // Pass services to context
    onFormSubmit: handleFormSubmit,
    onInputChange: handleInputChange
  };

  // Show error banner if there was a query error, but still render the page
  const errorBanner = queryError ? (
    <div style={{ backgroundColor: '#fee', color: '#c00', padding: '10px', marginBottom: '10px', borderRadius: '4px' }}>
      ⚠️ Some data failed to load: {queryError}
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

// ✅ MOVED: resolveExpression and processString now imported from renderHelpers.ts

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
      <>
        {/* Render content if present */}
        {element.content && renderContent(element.content, ctx)}
        {/* Then render child elements */}
        {element.elements?.map((child, i) => 
          <React.Fragment key={i}>{renderElement(child, ctx)}</React.Fragment>
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
      
      // ✅ FIXED: Hidden input values now derived at initialization (no setTimeout!)
      
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
      return renderLoop(element, ctx, renderElement);
    
    case 'if':
      return renderIf(element, ctx, renderElement);

    case 'json':
      return renderJson(element, ctx);

    case 'component':
      return <ComponentWrapper element={element} ctx={ctx} renderElement={renderElement} />;

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

// ✅ MOVED: renderIf extracted to renderHelpers.ts

// ✅ MOVED: renderLoop extracted to renderHelpers.ts


// Pure component renderer - renders embedded hypernote components
function renderComponent(element: HypernoteElement & { alias?: string; argument?: string }, ctx: RenderContext): React.ReactNode {
  return <ComponentWrapper element={element} ctx={ctx} renderElement={renderElement} />;
}

// ✅ MOVED: renderJson extracted to renderHelpers.ts 