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
    private userPubkey: string | null
  ) {}
  
  async runAll(h: Hypernote, opts: any) {
    // Skip if no client
    if (!this.client) {
      return {
        queryResults: {},
        extractedVariables: {}
      };
    }
    
    // Use existing HypernoteExecutor for now
    const { HypernoteExecutor } = await import('./HypernoteExecutor');
    
    // Convert actionResults to Map format expected by executor
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
    
    // Add parent extracted variables if provided
    if (opts.parentExtracted) {
      for (const [key, value] of Object.entries(opts.parentExtracted)) {
        context.queryResults.set(key, value);
      }
    }
    
    const executor = new HypernoteExecutor(
      h,
      context,
      this.client,
      this.queryCache,
      undefined // Don't pass signEvent to query-only engine
    );
    
    try {
      // Phase 1: Static resolution
      const staticData = executor.resolveStaticData();
      
      // Phase 2: Execute queries if any exist
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
    private relayHandler: RelayHandler,
    private signEvent: (event: any) => Promise<any>,
    private userPubkey: string | null,
    private queryCache: any
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
      
      // Sign the event
      const signedEvent = await this.signEvent(unsignedEvent);
      
      // Publish to relays
      const result = await this.relayHandler.publishEvent(
        signedEvent.kind,
        signedEvent.content,
        signedEvent.tags
      );
      
      console.log(`[RelayActionExecutor] Published to ${result.successCount} relays`);
      return result.eventId;
      
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
  
  return {
    queryEngine: new SNSTRQueryEngine(snstrClient, queryCache, userPubkey),
    actionExecutor: new RelayActionExecutor(relayHandler, signEvent, userPubkey, queryCache), 
    targetParser: new SNSTRTargetParser(snstrClient || undefined),
    clock: { now: () => Date.now() },
    userPubkey,
    
    // Temporary for gradual migration
    snstrClient,
    relayHandler
  };
}