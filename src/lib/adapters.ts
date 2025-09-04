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
  constructor(private client: SNSTRClient) {}
  
  async runAll(h: Hypernote, opts: any) {
    // For now, return empty results - will implement gradually
    return {
      queryResults: {},
      extractedVariables: {}
    };
  }
}

/**
 * Relay-based action executor adapter  
 */
export class RelayActionExecutor implements ActionExecutor {
  constructor(
    private relayHandler: RelayHandler,
    private signEvent: (event: any) => Promise<any>
  ) {}
  
  async execute(actionName: string, form: Record<string, string>): Promise<string | void> {
    // For now, just log - will implement gradually
    console.log(`[RelayActionExecutor] Would execute ${actionName} with form:`, form);
    return undefined;
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
  return {
    queryEngine: new SNSTRQueryEngine(snstrClient!),
    actionExecutor: new RelayActionExecutor(relayHandler, signEvent), 
    targetParser: new SNSTRTargetParser(snstrClient || undefined),
    clock: { now: () => Date.now() },
    userPubkey
  };
}