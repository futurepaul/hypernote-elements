import type { NostrEvent } from './snstr/nip07';
import { SimpleQueryExecutor } from './simple-query-executor';
import { applyPipes } from './pipes';
import { SNSTRClient } from './snstr/client';
import { queryCache as QueryCacheInstance } from './queryCache';
import { UnifiedResolver, type ResolutionContext } from './UnifiedResolver';
import type { Hypernote } from './schema';

// Context for resolving variables (matches ResolutionContext)
export interface ExecutorContext {
  user: { pubkey: string | null };
  target?: any;
  queryResults: Map<string, any>;
  actionResults: Map<string, string> | Record<string, string>;  // Support both formats
  loopVariables?: Record<string, any>;
  formData?: Record<string, any>;
}

// Resolved data ready for rendering
export interface ResolvedData {
  queryResults: Record<string, any>;
  extractedVariables: Record<string, any>;
  loadingQueries: Set<string>;
}

// Live subscription cleanup function
type Cleanup = () => void;

// Callback for data updates
type UpdateCallback = (data: Partial<ResolvedData>) => void;

/**
 * Pure TypeScript executor for Hypernote logic
 * Handles queries, actions, pipes, and live subscriptions
 */
export class HypernoteExecutor {
  private queries: Record<string, any>;
  private actions: Record<string, any>;
  private resolver: UnifiedResolver;
  private snstrClient: SNSTRClient;
  private queryCache: typeof QueryCacheInstance;
  private subscriptions: Map<string, Cleanup> = new Map();
  private resolvedFilters: Map<string, any> = new Map();
  private signEvent?: (event: any) => Promise<NostrEvent>;
  
  // Callback for updates
  public onUpdate?: UpdateCallback;
  
  constructor(
    hypernote: Partial<Hypernote>,
    context: ExecutorContext,
    snstrClient: SNSTRClient,
    queryCache: typeof QueryCacheInstance,
    signEvent?: (event: any) => Promise<NostrEvent>
  ) {
    this.queries = hypernote.queries || {};
    this.actions = hypernote.events || {};
    
    // Create unified resolver with initial context
    const resolutionContext: ResolutionContext = {
      queryResults: context.queryResults || new Map(),
      actionResults: context.actionResults || new Map(),
      formData: context.formData || {},
      loopVariables: context.loopVariables || {},
      user: context.user,
      target: context.target,
      time: { now: Date.now() }
    };
    this.resolver = new UnifiedResolver(resolutionContext);
    
    this.snstrClient = snstrClient;
    this.queryCache = queryCache;
    this.signEvent = signEvent;
  }
  
  /**
   * Phase 1: Resolve static data without network calls
   */
  resolveStaticData(): ResolvedData {
    // For now, return empty - static resolution can be added later
    return {
      queryResults: {},
      extractedVariables: {},
      loadingQueries: new Set(Object.keys(this.queries))
    };
  }
  
  /**
   * Phase 2: Execute queries with dependency resolution
   */
  async executeQueries(): Promise<ResolvedData> {
    // Get current context from resolver
    const resolverContext = this.resolver.getContext();
    
    // Convert to SimpleQueryExecutor context format
    const executorContext = {
      user: resolverContext.user,
      target: resolverContext.target,
      time: resolverContext.time,
      queryResults: resolverContext.queryResults,
      actionResults: resolverContext.actionResults
    };
    
    // Use SimpleQueryExecutor for dependency resolution
    const executor = new SimpleQueryExecutor(
      this.queries,
      executorContext,
      (filter) => this.fetchWithCache(filter)
    );
    
    // Execute all queries in dependency order
    const { results, resolvedFilters } = await executor.executeAll();
    
    // Store resolved filters for live subscriptions
    this.resolvedFilters = resolvedFilters;
    
    // Update resolver context with new query results
    this.resolver.updateContext({ queryResults: results });
    
    // Convert Map to object for React
    const queryResults: Record<string, any> = {};
    results.forEach((value, key) => {
      queryResults[key] = value;
    });
    
    // Set up live subscriptions for all queries
    this.setupLiveSubscriptions();
    
    return {
      queryResults,
      extractedVariables: (executor as any).getExtractedVariables ? (executor as any).getExtractedVariables() : {},
      loadingQueries: new Set()
    };
  }
  
  /**
   * Phase 3: Set up live subscriptions for all queries
   */
  private setupLiveSubscriptions(): void {
    // Clean up old subscriptions
    this.cleanup();
    
    // Create subscription for each query
    Object.entries(this.queries).forEach(([queryName, queryConfig]) => {
      const resolvedFilter = this.resolvedFilters.get(queryName);
      if (!resolvedFilter) return;
      
      const { pipe } = queryConfig;
      
      console.log(`[HypernoteExecutor] Setting up live subscription for ${queryName}`);
      
      // Subscribe to live events
      const cleanup = this.snstrClient.subscribeLive(
        [resolvedFilter],
        async (event: NostrEvent) => {
          console.log(`[HypernoteExecutor] New live event for ${queryName}:`, event.id);
          
          // Handle the live update
          await this.handleLiveUpdate(queryName, event, pipe);
        },
        () => {
          console.log(`[HypernoteExecutor] EOSE for ${queryName}`);
        }
      );
      
      this.subscriptions.set(queryName, cleanup);
    });
  }
  
  /**
   * Handle live update for a query - INCLUDING PIPES!
   */
  private async handleLiveUpdate(
    queryName: string, 
    event: NostrEvent,
    pipe?: any[]
  ): Promise<void> {
    // Get current context from resolver
    const context = this.resolver.getContext();
    const currentData = context.queryResults.get(queryName);
    
    let updatedData: any;
    
    if (pipe && pipe.length > 0) {
      // FIXED: Handle live updates with pipes!
      // Re-fetch all events and re-apply pipes
      const resolvedFilter = this.resolvedFilters.get(queryName);
      if (!resolvedFilter) return;
      
      // Get all events (including the new one)
      const allEvents = await this.fetchWithCache(resolvedFilter);
      
      // Apply pipes to get transformed result
      updatedData = applyPipes(allEvents, pipe);
    } else {
      // Simple case: no pipes, just append/prepend the event
      if (Array.isArray(currentData)) {
        // Check for duplicates
        if (currentData.some(e => e.id === event.id)) return;
        
        // Add new event at the beginning (newest first)
        updatedData = [event, ...currentData];
      } else {
        // Single event query
        updatedData = event;
      }
    }
    
    // Update resolver context with new query result
    const queryResults = new Map([[queryName, updatedData]]);
    this.resolver.updateContext({ queryResults });
    
    // Get all query results for React update
    const allQueryResults: Record<string, any> = {};
    const updatedContext = this.resolver.getContext();
    updatedContext.queryResults.forEach((value, key) => {
      allQueryResults[key] = value;
    });
    
    // Notify React
    if (this.onUpdate) {
      this.onUpdate({ queryResults: allQueryResults });
    }
    
    // Check if this query triggers any actions
    const queryConfig = this.queries[queryName];
    if (queryConfig.triggers) {
      // Execute triggered action
      await this.executeAction(queryConfig.triggers, {});
    }
  }
  
  /**
   * Execute an action (publish an event)
   */
  async executeAction(actionName: string, formData: Record<string, any>): Promise<string | null> {
    const fullActionName = actionName.startsWith('@') ? actionName : `@${actionName}`;
    const action = this.actions[fullActionName];
    
    if (!action) {
      console.error(`Action ${fullActionName} not found in`, this.actions);
      return null;
    }
    
    // Update resolver context with form data
    this.resolver.updateContext({ 
      formData,
      time: { now: Date.now() }
    });
    
    // Resolve the entire action using unified resolver
    const resolvedAction = this.resolver.resolve(action);
    
    // Build the unsigned event
    const unsignedEvent = {
      kind: resolvedAction.kind,
      content: resolvedAction.content,
      tags: resolvedAction.tags || [],
      created_at: Math.floor(Date.now() / 1000)
    };
    
    // Sign the event if signing function is available
    const eventToPublish = this.signEvent 
      ? await this.signEvent(unsignedEvent)
      : { ...unsignedEvent, pubkey: '', id: '', sig: '' } as NostrEvent;
    
    // The signed event should have an id
    const eventId = eventToPublish.id;
    
    if (!eventId) {
      console.error(`[HypernoteExecutor] Signed event has no ID:`, eventToPublish);
      return null;
    }
    
    // Publish the event
    const publishResult = await this.snstrClient.publishEvent(eventToPublish);
    
    console.log(`[HypernoteExecutor] Published event ${eventId} for action ${fullActionName}`);
    
    // Store the event ID in resolver context for queries that depend on it
    const actionResults = new Map([[fullActionName, eventId]]);
    this.resolver.updateContext({ actionResults });
    
    // No need to invalidate queries - they're live and will auto-update!
    
    return eventId;
  }
  
  
  /**
   * Fetch events with caching
   */
  private async fetchWithCache(filter: any): Promise<NostrEvent[]> {
    return this.queryCache.getOrFetch(
      filter,
      (f) => this.snstrClient.fetchEvents([f])
    );
  }
  
  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    this.subscriptions.forEach(cleanup => cleanup());
    this.subscriptions.clear();
  }
  
  /**
   * Get current query results
   */
  getCurrentResults(): Record<string, any> {
    const context = this.resolver.getContext();
    const results: Record<string, any> = {};
    context.queryResults.forEach((value, key) => {
      results[key] = value;
    });
    return results;
  }
}