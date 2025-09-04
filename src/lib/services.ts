/**
 * Service interfaces for dependency injection
 * Following RENDER_REFACTOR_IDEAS.md approach
 * These contracts break circular dependencies by inverting control
 */

import type { Hypernote } from './schema';

// Target context for components
export interface TargetContext {
  // For kind: 0 (npub input)
  pubkey?: string;
  name?: string;
  picture?: string;
  nip05?: string;
  
  // For kind: 1 (nevent input)  
  id?: string;
  content?: string;
  created_at?: number;
  tags?: string[][];
  
  // Raw input value
  raw: string;
}

/**
 * Query engine contract - handles all Nostr data fetching
 */
export interface QueryEngine {
  runAll(
    h: Hypernote, 
    opts: { 
      actionResults: Record<string, string>; 
      onTriggerAction?: (name: string) => void; 
      target?: TargetContext; 
      parentExtracted?: Record<string, unknown>;
    }
  ): Promise<{ 
    queryResults: Record<string, unknown[]>; 
    extractedVariables: Record<string, unknown>;
  }>;
  
  // Optional streaming for live updates
  stream?: () => () => void;
}

/**
 * Action executor contract - handles event publishing
 */
export interface ActionExecutor {
  execute(actionName: string, form: Record<string, string>): Promise<string | void>;
}

/**
 * Target parser contract - handles component argument resolution
 */
export interface TargetParser {
  parse(arg: string, kind: 0 | 1): Promise<TargetContext>;
}

/**
 * Clock contract - provides time for expressions
 */
export interface Clock {
  now(): number;
}

/**
 * Services bundle - all injected dependencies
 */
export interface Services {
  queryEngine: QueryEngine;
  actionExecutor: ActionExecutor;
  targetParser: TargetParser;
  clock: Clock;
  userPubkey: string | null;
}

/**
 * Default clock implementation
 */
export const defaultClock: Clock = {
  now: () => Date.now()
};