import React, { useState, useMemo, useEffect, useRef } from 'react';
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

  // Compile markdown to content object - memoize to prevent unnecessary recompilation
  const content: Hypernote = useMemo(
    () => compileHypernoteToContent(debouncedMarkdown || ''),
    [debouncedMarkdown]
  );

  return <RenderHypernoteContent content={content} />;
}

// New: Render from compiled Hypernote JSON directly
export function RenderHypernoteContent({ content }: { content: Hypernote }) {
  // Get SNSTR client from store
  const { snstrClient } = useNostrStore();

  // Set up component resolver
  const resolverRef = useRef<ComponentResolver | undefined>(undefined);
  const [componentsLoaded, setComponentsLoaded] = useState(false);

  // Prefetch all imported components
  useEffect(() => {
    const loadComponents = async () => {
      if (content.imports && Object.keys(content.imports).length > 0) {
        // Wait for snstrClient to be available
        if (!snstrClient) {
          console.log('[Renderer] Waiting for SNSTRClient to initialize...');
          return;
        }

        console.log('[Renderer] Loading imported components:', content.imports);
        const resolver = new ComponentResolver(snstrClient);

        try {
          await resolver.prefetchComponents(content.imports);
          resolverRef.current = resolver;
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
  }, [content.imports, snstrClient]);

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

  // Set up reactive event subscriptions
  useEffect(() => {
    if (!content.events || !snstrClient) return;

    const subscriptions: any[] = [];
    
    // Look for events with 'match' field (reactive events)
    for (const [eventName, eventDef] of Object.entries(content.events)) {
      if (!eventDef.match) continue;
      
      console.log(`[Reactive] Setting up subscription for event: ${eventName}`);
      
      // Build context for variable resolution
      const context = {
        ...queryResults,
        ...extractedVariables,
        form: formData,
        user: userContext
      };
      
      // Resolve variables in match filter
      const resolvedFilter = resolveObjectVariables(eventDef.match, context);
      
      // Subscribe to matching events
      const unsubscribe = snstrClient.subscribe(
        [resolvedFilter],
        async (matchedEvent: NostrEvent) => {
          console.log(`[Reactive] Event ${eventName} matched:`, matchedEvent);
          
          // Apply pipes if specified
          let processedData = matchedEvent;
          if (eventDef.pipe) {
            processedData = applyPipes(matchedEvent, eventDef.pipe);
          }
          
          // Create context with the processed result
          const eventContext = {
            ...context,
            result: processedData,
            matched: matchedEvent
          };
          
          // Process the 'then' event template
          if (eventDef.then) {
            const newEvent = resolveObjectVariables(eventDef.then, eventContext);
            
            // Sign and publish the new event
            if (isAuthenticated) {
              try {
                const unsignedEvent = {
                  ...newEvent,
                  created_at: Math.floor(Date.now() / 1000)
                };
                
                const signedEvent = await signEvent(unsignedEvent);
                const result = await snstrClient.publishEvent(signedEvent);
                
                console.log(`[Reactive] Published reactive event: ${result.eventId}`);
                toast.success('Reactive event triggered!');
              } catch (error) {
                console.error(`[Reactive] Failed to publish event:`, error);
                toast.error('Failed to trigger reactive event');
              }
            }
          }
        }
      );
      
      subscriptions.push(unsubscribe);
    }
    
    // Cleanup subscriptions on unmount
    return () => {
      subscriptions.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [content.events, snstrClient, queryResults, extractedVariables, formData, userContext, isAuthenticated]);

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

    // Check if this is a reactive event (has 'match' field)
    if (eventTemplate.match) {
      // This is a reactive event - it sets up a subscription, not an immediate action
      console.log(`[Reactive] Event ${eventName} has match field, setting up subscription`);
      
      // The subscription setup is handled in a useEffect below
      toast.info('Reactive event subscription will be registered');
      return;
    }

    // Regular event publishing (not a tool call)
    // Process template variables
    let eventContent = eventTemplate.content || '';
    if (typeof eventContent === 'string') {
      // Replace {form.fieldName} with actual form values
      if (eventContent.includes('{form.')) {
        Object.keys(formData).forEach(key => {
          eventContent = eventContent.replace(new RegExp(`\\{form\\.${key}\\}`, 'g'), formData[key] || '');
        });
      }
    }

    // Handle 'd' tag for replaceable events
    const tags = eventTemplate.tags ? [...eventTemplate.tags] : [];
    if (eventTemplate.d) {
      tags.push(['d', eventTemplate.d]);
    }

    // Create event template for signing
    const unsignedEvent = {
      kind: eventTemplate.kind,
      content: eventContent,
      tags: tags,
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
    return result !== undefined ? result : '';
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
  return value !== undefined ? value : expr;
}

// Pure string processor - replaces {expressions} with values  
function processString(str: string, ctx: RenderContext): string {
  return resolveVariables(str, {
    ...ctx.queryResults,
    ...ctx.extractedVariables,
    form: ctx.formData,
    loop: ctx.loopVariables,
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
  
  // Evaluate the condition
  const value = resolveExpression(cleanCondition, ctx);
  
  // Determine truthiness
  let isTruthy = false;
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
  const resolvedArgument = argument.startsWith('{') && argument.endsWith('}') 
    ? processString(argument, ctx)  // Has braces, use processString
    : String(resolveExpression(argument, ctx));  // No braces, resolve directly
  
  // Parse target context from the argument
  const [targetContext, setTargetContext] = useState<TargetContext | null>(null);
  const [targetLoading, setTargetLoading] = useState(true);
  const [targetError, setTargetError] = useState<string | null>(null);
  const { snstrClient: componentSnstrClient } = useNostrStore();
  
  useEffect(() => {
    const loadTarget = async () => {
      if (!resolvedArgument) {
        setTargetError('No argument provided');
        setTargetLoading(false);
        return;
      }
      
      try {
        setTargetLoading(true);
        setTargetError(null);
        
        // Parse the target based on component kind
        const target = await parseTarget(resolvedArgument, componentDef.kind as (0 | 1), componentSnstrClient || undefined);
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
  
  // Create component context with target
  const componentCtx: RenderContext = {
    ...ctx,
    target: targetContext || undefined,
    depth: ctx.depth + 1,
    // Reset loop variables for component scope
    loopVariables: {},
    // Component gets its own query results (queries are scoped)
    queryResults: {},
    extractedVariables: {},
    loadingQueries: new Set()
  };
  
  // Recursively render component's elements
  return (
    <ComponentRenderer 
      componentDef={componentDef}
      context={componentCtx}
      elementStyle={element.style}
      elementId={element.elementId}
    />
  );
}

// Pure component renderer - renders embedded hypernote components
function renderComponent(element: HypernoteElement & { alias?: string; argument?: string }, ctx: RenderContext): React.ReactNode {
  return <ComponentWrapper element={element} ctx={ctx} />;
}

// Component renderer - renders the actual component content with its own context
function ComponentRenderer({ 
  componentDef, 
  context, 
  elementStyle, 
  elementId 
}: { 
  componentDef: Hypernote; 
  context: RenderContext; 
  elementStyle?: any;
  elementId?: string;
}) {
  // Execute queries for this component with target context
  const { queryResults, extractedVariables, allLoading } = useQueryExecution(
    componentDef.queries || {},
    {
      target: context.target,
      parentExtracted: context.extractedVariables
    }
  );
  
  // Merge the query results into context
  const componentCtx: RenderContext = {
    ...context,
    queryResults,
    extractedVariables,
    loadingQueries: allLoading ? new Set(Object.keys(componentDef.queries || {})) : new Set()
  };
  
  // Render the component's elements
  return (
    <div id={elementId} style={elementStyle}>
      {componentDef.elements?.map((el, i) => (
        <React.Fragment key={i}>
          {renderElement(el as HypernoteElement, componentCtx)}
        </React.Fragment>
      ))}
    </div>
  );
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