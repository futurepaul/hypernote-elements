/**
 * Adapter implementations that wrap existing systems
 * These implement the service interfaces using current stores/clients
 */

import type { QueryEngine, ActionExecutor, TargetParser, Services } from './services';
import type { Hypernote } from './schema';
import { SNSTRClient } from './snstr/client';
import { RelayHandler } from './relayHandler';
import { parseTarget } from './componentResolver';

/**
 * SNSTR-based query engine adapter
 */
export class SNSTRQueryEngine implements QueryEngine {
  constructor(
    private client: SNSTRClient | null,
    private queryCache: any,
    private userPubkey: string | null,
    private sharedExecutor: any = null
  ) {}
  
  async runAll(h: Hypernote, opts: any) {
    // Skip if no client
    if (!this.client) {
      return {
        queryResults: {},
        extractedVariables: {}
      };
    }
    
    // Use shared executor if available for subscription deduplication
    if (this.sharedExecutor) {
      console.log(`[SNSTRQueryEngine] Using SHARED executor for`, Object.keys(h.queries || {}));
      return this.runWithSharedExecutor(h, opts);
    }
    
    // Fallback to individual executor (should rarely happen now)
    console.log(`[SNSTRQueryEngine] Using INDIVIDUAL executor for`, Object.keys(h.queries || {}));
    return this.runWithIndividualExecutor(h, opts);
  }
  
  private async runWithSharedExecutor(h: Hypernote, opts: any) {
    // Add new queries to the shared executor dynamically
    const hasQueries = h.queries && Object.keys(h.queries).length > 0;
    if (!hasQueries) {
      return { queryResults: {}, extractedVariables: {} };
    }
    
    // The shared executor will handle subscription deduplication automatically
    // Since it maintains a single subscription map across all queries
    console.log(`[SNSTRQueryEngine] Using shared executor for queries:`, Object.keys(h.queries));
    
    try {
      // Add queries to shared executor and execute
      Object.assign(this.sharedExecutor.queries, h.queries);
      
      // Update context for this execution
      this.sharedExecutor.resolver.updateContext({
        target: opts.target,
        actionResults: opts.actionResults ? new Map(Object.entries(opts.actionResults)) : new Map(),
        formData: opts.formData || {}
      });
      
      const queryData = await this.sharedExecutor.executeQueries();
      return {
        queryResults: queryData.queryResults,
        extractedVariables: queryData.extractedVariables
      };
    } catch (error) {
      console.error('[SNSTRQueryEngine] Shared executor error:', error);
      throw error;
    }
  }
  
  private async runWithIndividualExecutor(h: Hypernote, opts: any) {
    // Original implementation as fallback
    const { HypernoteExecutor } = await import('./HypernoteExecutor');
    
    const actionResults = new Map();
    if (opts.actionResults) {
      for (const [key, value] of Object.entries(opts.actionResults)) {
        actionResults.set(key, value);
      }
    }
    
    const context = {
      user: { pubkey: this.userPubkey },
      target: opts.target,
      queryResults: new Map(),
      actionResults
    };
    
    if (opts.parentExtracted) {
      for (const [key, value] of Object.entries(opts.parentExtracted)) {
        context.queryResults.set(key, value);
      }
    }
    
    const executor = new HypernoteExecutor(h, context, this.client, this.queryCache, undefined);
    
    try {
      const staticData = executor.resolveStaticData();
      const hasQueries = h.queries && Object.keys(h.queries).length > 0;
      
      if (hasQueries) {
        const queryData = await executor.executeQueries();
        return {
          queryResults: queryData.queryResults,
          extractedVariables: queryData.extractedVariables
        };
      }
      
      return {
        queryResults: staticData.queryResults,
        extractedVariables: staticData.extractedVariables
      };
    } finally {
      executor.cleanup();
    }
  }
}

/**
 * Relay-based action executor adapter  
 */
export class RelayActionExecutor implements ActionExecutor {
  constructor(
    private snstrClient: any, // Use snstrClient for publishing (working method)
    private signEvent: (event: any) => Promise<any>,
    private userPubkey: string | null
  ) {}
  
  async execute(
    actionName: string, 
    form: Record<string, string>,
    hypernote: Hypernote,
    context: {
      queryResults: Record<string, any>;
      extractedVariables: Record<string, any>;
      userPubkey: string | null;
    }
  ): Promise<string | void> {
    console.log(`[RelayActionExecutor] Executing ${actionName} with form:`, form);
    
    const fullActionName = actionName.startsWith('@') ? actionName : `@${actionName}`;
    const action = hypernote.events?.[fullActionName];
    
    if (!action) {
      console.error(`Action ${fullActionName} not found in hypernote events`);
      return undefined;
    }
    
    try {
      // Import UnifiedResolver to resolve the action template
      const { UnifiedResolver } = await import('./UnifiedResolver');
      
      // Create resolver context (similar to HypernoteExecutor)
      const resolverContext = {
        user: { pubkey: context.userPubkey },
        target: undefined, // Actions don't typically need target context
        time: { now: Date.now() },
        queryResults: new Map(Object.entries(context.queryResults)),
        actionResults: new Map(),
        formData: form,
        loopVariables: {} // Required by ResolutionContext
      };
      
      const resolver = new UnifiedResolver(resolverContext);
      
      // Resolve the action template
      const resolvedAction = resolver.resolve(action);
      
      // Handle json field - convert to content string
      let content = resolvedAction.content;
      if (!content && resolvedAction.json) {
        content = JSON.stringify(resolvedAction.json);
      }
      
      // Build the unsigned event
      const unsignedEvent = {
        kind: resolvedAction.kind || 1,
        content: content || '',
        tags: resolvedAction.tags || [],
        created_at: Math.floor(Date.now() / 1000)
      };
      
      console.log(`[RelayActionExecutor] Publishing event:`, unsignedEvent);
      
      // Sign the event if signing function is available
      const eventToPublish = this.signEvent 
        ? await this.signEvent(unsignedEvent)
        : { ...unsignedEvent, pubkey: '', id: '', sig: '' };
      
      // The signed event should have an id
      const eventId = eventToPublish.id;
      
      if (!eventId) {
        console.error(`[RelayActionExecutor] Signed event has no ID:`, eventToPublish);
        return undefined;
      }
      
      // Publish the event using the same method that works in HypernoteExecutor
      const publishResult = await this.snstrClient.publishEvent(eventToPublish);
      
      console.log(`[RelayActionExecutor] Published event ${eventId} for action ${actionName}`);
      return eventId;
      
    } catch (error) {
      console.error(`[RelayActionExecutor] Error executing action ${actionName}:`, error);
      return undefined;
    }
  }
}

/**
 * SNSTR-based target parser adapter
 */
export class SNSTRTargetParser implements TargetParser {
  constructor(private client?: SNSTRClient) {}
  
  async parse(arg: string, kind: 0 | 1) {
    // Use existing parseTarget function
    return parseTarget(arg, kind, this.client);
  }
}

/**
 * Create services bundle from current app state
 */
export function createServices(
  snstrClient: SNSTRClient | null,
  relayHandler: RelayHandler,
  signEvent: (event: any) => Promise<any>,
  userPubkey: string | null
): Services {
  // Import queryCache for the query engine
  const { queryCache } = require('./queryCache');
  
  // Create shared HypernoteExecutor for subscription deduplication
  let sharedExecutor = null;
  if (snstrClient) {
    const { HypernoteExecutor } = require('./HypernoteExecutor');
    
    // Create a global context for the shared executor
    const sharedContext = {
      user: { pubkey: userPubkey },
      target: undefined,
      queryResults: new Map(),
      actionResults: new Map()
    };
    
    // Create shared executor with empty hypernote initially
    // It will accumulate queries as they come through runAll()
    sharedExecutor = new HypernoteExecutor(
      { elements: [], queries: {}, events: {} }, // Empty initial hypernote
      sharedContext,
      snstrClient,
      queryCache,
      signEvent
    );
  }

  return {
    queryEngine: new SNSTRQueryEngine(snstrClient, queryCache, userPubkey, sharedExecutor),
    actionExecutor: new RelayActionExecutor(snstrClient, signEvent, userPubkey), 
    targetParser: new SNSTRTargetParser(snstrClient || undefined),
    clock: { now: () => Date.now() },
    userPubkey,
    
    // Shared executor for subscription deduplication
    sharedExecutor,
    
    // Legacy support - kept for ComponentWrapper compatibility
    snstrClient,
    relayHandler
  };
}