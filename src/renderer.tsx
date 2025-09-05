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

// ✅ MOVED: renderIf extracted to renderHelpers.ts

// ✅ MOVED: renderLoop extracted to renderHelpers.ts

// Component wrapper that handles loading target context
function ComponentWrapper({ element, ctx }: { element: HypernoteElement & { alias?: string; argument?: string }, ctx: RenderContext }) {
  const alias = element.alias || 'unknown';
  const argument = element.argument || '';
  
  // Components are now queries! Look up the query result
  const componentQueryName = `#${alias}`;
  const componentQueryResult = ctx.queryResults[componentQueryName];
  
  // ALWAYS CALL ALL HOOKS FIRST - no early returns before hooks!
  
  // Parse component definition (try to parse even if we might error)
  let componentDef: Hypernote | null = null;
  let parseError: string | null = null;
  
  try {
    if (componentQueryResult) {
      const event = Array.isArray(componentQueryResult) ? componentQueryResult[0] : componentQueryResult;
      if (event) {
        componentDef = JSON.parse(event.content);
        // Validate it's a Hypernote element
        if (componentDef && componentDef.type !== 'element') {
          throw new Error('Component must be of type "element"');
        }
      }
    }
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Parse error';
  }
  
  // Resolve the argument to get npub/nevent value
  // Component arguments work like [json $variable] - no braces needed
  // Use useMemo to ensure it updates when relevant context changes
  const resolvedArgument = useMemo(() => {
    const resolved = argument.startsWith('{') && argument.endsWith('}') 
      ? processString(argument, ctx)  // Has braces, use processString
      : String(resolveExpression(argument, ctx, defaultClock));  // No braces, resolve directly
    
    // console.log(`[Component] Resolving argument for ${alias}: "${argument}" -> "${resolved}"`);
    // console.log(`[Component] Component def kind: ${componentDef.kind}`);
    return resolved;
  }, [argument, ctx.loopVariables, ctx.queryResults, ctx.extractedVariables, ctx.userPubkey, alias, componentDef?.kind]);
  
  // Parse target context from the argument
  const [targetContext, setTargetContext] = useState<TargetContext | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetError, setTargetError] = useState<string | null>(null);
  
  // Component query state hooks - MUST be declared at top level
  const [componentQueryResults, setComponentQueryResults] = useState<Record<string, any>>({});
  const [componentExtractedVars, setComponentExtractedVars] = useState<Record<string, any>>({});
  const [componentQueriesLoading, setComponentQueriesLoading] = useState(false);
  
  // Get SNSTR client from services
  const componentSnstrClient = ctx.services?.snstrClient;
  
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
      if (componentDef?.kind === 0 && targetContext.name) {
        queries['$profile'] = {
          name: targetContext.name,
          picture: targetContext.picture,
          nip05: targetContext.nip05
        };
      } else if (componentDef?.kind === 1 && targetContext.content) {
        queries['$note'] = targetContext;
      }
      // Add more patterns as needed
    }
    
    return queries;
  }, [componentDef?.kind, targetContext]);
  
  // Move queryOptions useMemo BEFORE any conditional returns
  const queryOptions = useMemo(() => ({
    target: targetContext,
    parentExtracted: ctx.extractedVariables
  }), [targetContext, ctx.extractedVariables]);
  
  useEffect(() => {
    const loadTarget = async () => {
      // If component doesn't require an argument (no kind field), skip target loading
      if (componentDef?.kind === undefined) {
        console.log(`[Component] Component ${alias} doesn't require an argument (no kind field)`);
        setTargetContext(null);
        setTargetLoading(false);
        setTargetError(null);
        return;
      }
      
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
        
        // Parse the target based on component kind using services
        const target = await ctx.services!.targetParser.parse(resolvedArgument, componentDef!.kind as (0 | 1));
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
  }, [resolvedArgument, componentDef?.kind, componentSnstrClient, alias]);
  
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
  
  // Show error state (only if component expects an argument)
  if (targetError && componentDef?.kind !== undefined) {
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
  // But only check this if the component expects an argument
  if (!targetContext && componentDef?.kind !== undefined) {
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
  const hasQueries = componentDef?.queries && Object.keys(componentDef?.queries || {}).length > 0;
  
  // Skip query execution if we have pre-populated data (prevents infinite loops)
  if (hasPrePopulatedData || !hasQueries) {
    // Safety check before rendering
    if (!componentDef) {
      return (
        <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
          ⚠️ Component definition is null: #{alias} (no queries path)
        </div>
      );
    }
    
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
  
  // Only execute queries if needed (queryOptions already defined above)
  
  // Use services from context for component queries (state already declared above)
  
  useEffect(() => {
    const hasQueries = componentDef?.queries && Object.keys(componentDef?.queries || {}).length > 0;
    if (!hasQueries || !ctx.services || !componentDef) return;
    
    const runComponentQueries = async () => {
      try {
        setComponentQueriesLoading(true);
        const result = await ctx.services!.queryEngine.runAll(componentDef, queryOptions);
        setComponentQueryResults(result.queryResults);
        setComponentExtractedVars(result.extractedVariables);
      } catch (err) {
        console.error('[Component] Query error:', err);
      } finally {
        setComponentQueriesLoading(false);
      }
    };
    
    runComponentQueries();
  }, [componentDef, queryOptions, ctx.services]);
  
  const queryResults = componentQueryResults;
  const extractedVariables = componentExtractedVars;
  const queriesLoading = componentQueriesLoading;
  
  // Update context with query results
  const finalCtx: RenderContext = {
    ...componentCtx,
    queryResults: { ...preResolvedQueries, ...queryResults },
    extractedVariables,
    loadingQueries: queriesLoading ? new Set(Object.keys(componentDef?.queries || {})) : new Set()
  };
  
  // CONDITIONAL RENDERING - after all hooks are called
  
  // Prevent nested components (max depth = 1)
  if (ctx.depth > 0) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Error: Components cannot include other components (max depth: 1)
      </div>
    );
  }
  
  // Check if component query is still loading
  if (ctx.loadingQueries?.has(componentQueryName)) {
    return (
      <div style={{ color: '#f59e0b', padding: '0.5rem', backgroundColor: '#fef3c7', borderRadius: '0.25rem' }}>
        ⏳ Loading component: #{alias}...
      </div>
    );
  }
  
  // Check if we have the component event
  if (!componentQueryResult) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Component not found: #{alias}
      </div>
    );
  }
  
  // Check for parsing errors
  if (parseError || !componentDef) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Invalid component format: #{alias} ({parseError || 'Unknown error'})
      </div>
    );
  }

  // Final safety check - this shouldn't happen but let's be defensive
  if (!componentDef) {
    return (
      <div style={{ color: '#ef4444', padding: '0.5rem', border: '1px solid #ef4444', borderRadius: '0.25rem' }}>
        ⚠️ Component definition is null: #{alias}
      </div>
    );
  }

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

// ✅ MOVED: renderJson extracted to renderHelpers.ts 