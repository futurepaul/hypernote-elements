import type { NostrEvent } from './snstr/nip07';
import { SimpleQueryExecutor } from './simple-query-executor';
import { applyPipes } from './pipes';
import { SNSTRClient } from './snstr/client';
import { queryCache as QueryCacheInstance } from './queryCache';
import type { Hypernote } from './schema';

// Context for resolving variables
export interface ExecutorContext {
  user: { pubkey: string | null };
  target?: any;
  queryResults: Map<string, any>;
  actionResults: Map<string, string>;
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
  private context: ExecutorContext;
  private snstrClient: SNSTRClient;
  private queryCache: typeof QueryCacheInstance;
  private subscriptions: Map<string, Cleanup> = new Map();
  private resolvedFilters: Map<string, any> = new Map();
  private currentResults: Map<string, any> = new Map();
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
    this.context = context;
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
    // Use SimpleQueryExecutor for dependency resolution
    const executor = new SimpleQueryExecutor(
      this.queries,
      this.context,
      (filter) => this.fetchWithCache(filter)
    );
    
    // Execute all queries in dependency order
    const { results, resolvedFilters } = await executor.executeAll();
    
    // Store resolved filters for live subscriptions
    this.resolvedFilters = resolvedFilters;
    this.currentResults = results;
    
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
    const currentData = this.currentResults.get(queryName);
    
    if (pipe && pipe.length > 0) {
      // FIXED: Handle live updates with pipes!
      // Re-fetch all events and re-apply pipes
      const resolvedFilter = this.resolvedFilters.get(queryName);
      if (!resolvedFilter) return;
      
      // Get all events (including the new one)
      const allEvents = await this.fetchWithCache(resolvedFilter);
      
      // Apply pipes to get transformed result
      const processed = applyPipes(allEvents, pipe);
      
      // Update stored results
      this.currentResults.set(queryName, processed);
      
      // Notify React
      if (this.onUpdate) {
        const queryResults: Record<string, any> = {};
        this.currentResults.forEach((value, key) => {
          queryResults[key] = value;
        });
        
        this.onUpdate({ queryResults });
      }
    } else {
      // Simple case: no pipes, just append/prepend the event
      let updatedData: any;
      
      if (Array.isArray(currentData)) {
        // Check for duplicates
        if (currentData.some(e => e.id === event.id)) return;
        
        // Add new event at the beginning (newest first)
        updatedData = [event, ...currentData];
      } else {
        // Single event query
        updatedData = event;
      }
      
      // Update stored results
      this.currentResults.set(queryName, updatedData);
      
      // Notify React
      if (this.onUpdate) {
        const queryResults: Record<string, any> = {};
        this.currentResults.forEach((value, key) => {
          queryResults[key] = value;
        });
        
        this.onUpdate({ queryResults });
      }
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
    const action = this.actions[actionName];
    if (!action) {
      console.error(`Action ${actionName} not found`);
      return null;
    }
    
    // Update context with form data
    const actionContext = {
      ...this.context,
      formData,
      queryResults: this.currentResults
    };
    
    // Resolve variables in the action
    const resolvedAction = this.resolveActionVariables(action, actionContext);
    
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
    
    console.log(`[HypernoteExecutor] Published event ${eventId} for action ${actionName}`);
    
    // Store the event ID for queries that depend on it
    this.context.actionResults.set(actionName, eventId);
    
    // No need to invalidate queries - they're live and will auto-update!
    
    return eventId;
  }
  
  /**
   * Resolve variables in an action
   */
  private resolveActionVariables(action: any, context: ExecutorContext): any {
    // This is a simplified version - full implementation would handle all variable types
    const resolved = { ...action };
    
    // Resolve content
    if (typeof resolved.content === 'string') {
      resolved.content = this.resolveString(resolved.content, context);
    } else if (resolved.json) {
      // Handle JSON content
      resolved.content = JSON.stringify(this.resolveObject(resolved.json, context));
    }
    
    // Resolve tags
    if (resolved.tags) {
      resolved.tags = resolved.tags.map((tag: any[]) => 
        tag.map(t => this.resolveString(t, context))
      );
    }
    
    return resolved;
  }
  
  /**
   * Resolve a string with variable substitutions
   */
  private resolveString(str: string, context: ExecutorContext): string {
    // Handle {$queryName} substitutions
    return str.replace(/\{([^}]+)\}/g, (match, expr) => {
      // Handle "or" operator for default values
      if (expr.includes(' or ')) {
        const [varPart, defaultPart] = expr.split(' or ').map(s => s.trim());
        
        // Try to resolve the variable part
        if (varPart.startsWith('$')) {
          const queryName = varPart;
          const result = context.queryResults.get(queryName);
          if (result !== undefined && result !== null && result !== '') {
            return String(result);
          }
        } else if (varPart === 'user.pubkey') {
          if (context.user.pubkey) {
            return context.user.pubkey;
          }
        }
        
        // Use the default value
        return defaultPart;
      }
      
      // Handle different expression types
      if (expr.startsWith('$')) {
        // Query result reference
        const queryName = expr;
        const result = context.queryResults.get(queryName);
        return result !== undefined ? String(result) : match;
      } else if (expr.startsWith('form.')) {
        // Form field reference
        const fieldName = expr.substring(5);
        return context.formData?.[fieldName] || '';
      } else if (expr === 'user.pubkey') {
        return context.user.pubkey || '';
      } else if (expr === 'time.now') {
        return String(Date.now());
      }
      
      return match;
    });
  }
  
  /**
   * Resolve an object with variable substitutions
   */
  private resolveObject(obj: any, context: ExecutorContext): any {
    if (typeof obj === 'string') {
      return this.resolveString(obj, context);
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.resolveObject(item, context));
    } else if (obj && typeof obj === 'object') {
      const resolved: any = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = this.resolveObject(value, context);
      }
      return resolved;
    }
    return obj;
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
    const results: Record<string, any> = {};
    this.currentResults.forEach((value, key) => {
      results[key] = value;
    });
    return results;
  }
}