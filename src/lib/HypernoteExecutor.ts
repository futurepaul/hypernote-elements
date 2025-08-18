import type { NostrEvent } from './snstr/nip07';
import { SimpleQueryExecutor } from './simple-query-executor';
import { applyPipes } from './pipes';
import { SNSTRClient } from './snstr/client';
import { queryCache as QueryCacheInstance } from './queryCache';
import { UnifiedResolver, type ResolutionContext } from './UnifiedResolver';
import type { Hypernote } from './schema';
import { nip19 } from 'nostr-tools';

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
  private queryResultHashes: Map<string, string> = new Map();
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
    // Expand any naddr strings in queries to full query objects
    this.queries = this.expandNaddrQueries(hypernote.queries || {});
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
   * Expand naddr strings to full query objects
   */
  private expandNaddrQueries(queries: Record<string, any>): Record<string, any> {
    const expanded: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(queries)) {
      if (typeof value === 'string' && value.startsWith('naddr')) {
        try {
          const decoded = nip19.decode(value);
          
          if (decoded.type === 'naddr') {
            const { identifier, pubkey, kind } = decoded.data;
            
            // Create a query from the naddr components
            const query: any = {
              kinds: [kind],
              authors: [pubkey],
              "#d": [identifier],
              limit: 1
            };
            
            // For component queries (#), automatically add the 'first' pipe
            if (key.startsWith('#')) {
              query.pipe = ['first'];
            }
            
            expanded[key] = query;
            console.log(`[HypernoteExecutor] Expanded naddr for ${key}:`, query);
          } else {
            // Not an naddr, keep as-is
            expanded[key] = value;
          }
        } catch (err) {
          console.error(`[HypernoteExecutor] Failed to parse naddr for ${key}:`, err);
          expanded[key] = value;
        }
      } else {
        // Not a string or doesn't start with naddr
        expanded[key] = value;
      }
    }
    
    return expanded;
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
    
    // Check which queries have actually changed
    const changedQueries = new Map<string, any>();
    results.forEach((value, key) => {
      const newHash = JSON.stringify(value);
      const oldHash = this.queryResultHashes.get(key);
      
      if (newHash !== oldHash) {
        console.log(`[HypernoteExecutor] Query ${key} result changed`);
        changedQueries.set(key, value);
        this.queryResultHashes.set(key, newHash);
      } else {
        console.log(`[HypernoteExecutor] Query ${key} result unchanged, skipping triggers`);
      }
    });
    
    // Update resolver context with new query results
    this.resolver.updateContext({ queryResults: results });
    
    // Convert Map to object for React
    const queryResults: Record<string, any> = {};
    results.forEach((value, key) => {
      queryResults[key] = value;
    });
    
    // Set up live subscriptions for all queries
    this.setupLiveSubscriptions();
    
    // Handle triggers for queries that changed AND have valid results
    for (const [queryName, result] of changedQueries) {
      const queryConfig = this.queries[queryName];
      
      // Skip triggers if the result is empty/unresolved
      if (!result || (Array.isArray(result) && result.length === 0)) {
        console.log(`[HypernoteExecutor] Query ${queryName} has no valid result, skipping trigger`);
        continue;
      }
      
      if (queryConfig.triggers) {
        console.log(`[HypernoteExecutor] Query ${queryName} changed and has trigger: ${queryConfig.triggers}`);
        await this.executeAction(queryConfig.triggers, {});
      }
    }
    
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
      
      console.log(`[HypernoteExecutor] Setting up live subscription for ${queryName} with filter:`, resolvedFilter);
      
      // Subscribe to live events
      const cleanup = this.snstrClient.subscribeLive(
        [resolvedFilter],
        async (event: NostrEvent) => {
          console.log(`[HypernoteExecutor] New live event for ${queryName}:`, event.id, event.kind);
          
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
      if (!resolvedFilter) {
        console.log(`[HypernoteExecutor] No resolved filter for ${queryName}, skipping update`);
        return;
      }
      
      // Get all events (including the new one) - skip cache for live updates!
      const allEvents = await this.snstrClient.fetchEvents([resolvedFilter]);
      console.log(`[HypernoteExecutor] Re-fetched ${allEvents.length} events for ${queryName} (bypassed cache)`);
      
      // Invalidate cache for this filter so future queries get fresh data
      this.queryCache.invalidate(resolvedFilter);
      
      // Apply pipes to get transformed result
      updatedData = applyPipes(allEvents, pipe);
      console.log(`[HypernoteExecutor] After pipes, ${queryName} =`, updatedData);
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
    
    // Check if the result actually changed
    const newHash = JSON.stringify(updatedData);
    const oldHash = this.queryResultHashes.get(queryName);
    const hasChanged = newHash !== oldHash;
    
    if (hasChanged) {
      console.log(`[HypernoteExecutor] Live update changed ${queryName} result`);
      this.queryResultHashes.set(queryName, newHash);
    } else {
      console.log(`[HypernoteExecutor] Live update didn't change ${queryName} result, skipping`);
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
      console.log(`[HypernoteExecutor] Notifying React with updated results for ${queryName}:`, allQueryResults[queryName]);
      this.onUpdate({ queryResults: allQueryResults });
    } else {
      console.log(`[HypernoteExecutor] No onUpdate callback set!`);
    }
    
    // Only trigger actions if the result actually changed AND is valid
    if (hasChanged && updatedData && !(Array.isArray(updatedData) && updatedData.length === 0)) {
      const queryConfig = this.queries[queryName];
      if (queryConfig.triggers) {
        console.log(`[HypernoteExecutor] Query ${queryName} changed via live update, executing trigger: ${queryConfig.triggers}`);
        await this.executeAction(queryConfig.triggers, {});
      }
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
    
    // Handle json field - convert to content string
    let content = resolvedAction.content;
    if (!content && resolvedAction.json) {
      content = JSON.stringify(resolvedAction.json);
    }
    
    // Build the unsigned event
    const unsignedEvent = {
      kind: resolvedAction.kind,
      content: content || '',
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
    
    // Clear the cache and re-execute all queries since we have new resolved values
    this.queryCache.clear();
    console.log(`[HypernoteExecutor] Action ${fullActionName} completed, re-executing queries`);
    
    // Re-execute all queries (some may now be resolvable with the new action result)
    await this.executeQueries();
    
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