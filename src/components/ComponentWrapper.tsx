import React, { useState, useMemo, useEffect } from 'react';
import type { Hypernote } from '../lib/schema';
import { resolveExpression, processString } from '../lib/renderHelpers';
import { defaultClock } from '../lib/services';

// Import types from renderer - we'll need to make these shared
interface RenderContext {
  // Data
  queryResults: Record<string, any[]>;
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
  
  // Services injection
  services?: any;
  
  // Callbacks (pure functions passed from parent)
  onFormSubmit: (eventName: string) => void;
  onInputChange: (name: string, value: string) => void;
}

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
  style?: Record<string, any>;
  alias?: string;
  argument?: string;
}

// Forward declare renderElement - will be passed as parameter
type RenderElementFn = (element: HypernoteElement, ctx: RenderContext) => React.ReactNode;

// Component wrapper that handles loading target context
export function ComponentWrapper({ 
  element, 
  ctx, 
  renderElement 
}: { 
  element: HypernoteElement & { alias?: string; argument?: string }, 
  ctx: RenderContext,
  renderElement: RenderElementFn
}) {
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
  
  // Resolve the argument to get npub/nevent value (even if componentDef is null)
  // Component arguments work like [json $variable] - no braces needed  
  // Use useMemo to ensure it updates when relevant context changes
  const resolvedArgument = useMemo(() => {
    if (!argument) return '';
    
    const resolved = argument.startsWith('{') && argument.endsWith('}') 
      ? processString(argument, ctx)  // Has braces, use processString
      : String(resolveExpression(argument, ctx, defaultClock));  // No braces, resolve directly
    
    return resolved;
  }, [argument, ctx.loopVariables, ctx.queryResults, ctx.extractedVariables, ctx.userPubkey, alias, componentDef?.kind]);
  
  // Parse target context from the argument
  const [targetContext, setTargetContext] = useState<any | null>(null);
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