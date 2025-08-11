/**
 * Simple query executor with implicit dependency resolution
 * Replaces the complex dependency graph with direct references
 */

import { applyPipes } from './pipes';
import { resolveVariables } from './pipes';
import type { NostrEvent } from './snstr/nip07';

interface QueryContext {
  user: { pubkey: string | null };
  target?: any;
  time: { now: number };
  queryResults: Map<string, any>; // Results of already executed queries
  actionResults: Map<string, string>; // Event IDs from published actions
}

export class SimpleQueryExecutor {
  private queries: Record<string, any>;
  private context: QueryContext;
  private fetchEvents: (filter: any) => Promise<NostrEvent[]>;
  
  constructor(
    queries: Record<string, any>,
    context: Partial<QueryContext>,
    fetchEvents: (filter: any) => Promise<NostrEvent[]>
  ) {
    this.queries = queries;
    this.context = {
      user: context.user || { pubkey: null },
      target: context.target,
      time: { now: Date.now() },
      queryResults: context.queryResults || new Map(),
      actionResults: context.actionResults || new Map(),
    };
    this.fetchEvents = fetchEvents;
  }
  
  async executeAll(): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    // Execute queries one by one (will handle dependencies)
    for (const [queryName, queryConfig] of Object.entries(this.queries)) {
      const result = await this.executeQuery(queryName, queryConfig);
      results.set(queryName, result);
      this.context.queryResults.set(queryName, result);
    }
    
    return results;
  }
  
  async executeQuery(queryName: string, queryConfig: any): Promise<any> {
    // Clone the config so we don't mutate the original
    const config = JSON.parse(JSON.stringify(queryConfig));
    
    // Resolve any references to other queries or actions
    await this.resolveReferences(config);
    
    // Build the Nostr filter (strip non-filter fields)
    const { pipe, triggers, ...filter } = config;
    
    // Resolve variables in the filter
    const resolvedFilter = this.resolveFilterVariables(filter);
    
    // Safety check: Don't send queries with unresolved @ or $ values
    const hasUnresolvedRefs = this.hasUnresolvedReferences(resolvedFilter);
    if (hasUnresolvedRefs) {
      console.log(`[SimpleQueryExecutor] Skipping query ${queryName} - has unresolved references:`, resolvedFilter);
      return [];
    }
    
    // Fetch events
    const events = await this.fetchEvents(resolvedFilter);
    
    // Apply pipes if any
    if (pipe && pipe.length > 0) {
      return applyPipes(events, pipe);
    }
    
    return events;
  }
  
  private async resolveReferences(config: any): Promise<void> {
    // Check each field for references to other queries ($query) or actions (@action)
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        // Check for query reference (e.g., "$contact_list")
        if (value.startsWith('$')) {
          const refQueryName = value;
          
          // If this query hasn't been executed yet, execute it now (implicit wait)
          if (!this.context.queryResults.has(refQueryName)) {
            const refQuery = this.queries[refQueryName];
            if (refQuery) {
              console.log(`[SimpleQueryExecutor] Implicit wait: executing ${refQueryName} before continuing`);
              const result = await this.executeQuery(refQueryName, refQuery);
              this.context.queryResults.set(refQueryName, result);
            }
          }
          
          // Replace with the query result
          const result = this.context.queryResults.get(refQueryName);
          if (result !== undefined) {
            config[key] = result;
          }
        }
        // Check for action reference (e.g., "@increment" -> event ID)
        else if (value.startsWith('@')) {
          const actionName = value;
          const eventId = this.context.actionResults.get(actionName);
          if (eventId) {
            config[key] = eventId;
          }
        }
      }
      // Handle arrays (e.g., authors: ["$contact_list"])
      else if (Array.isArray(value)) {
        const resolved = [];
        for (const item of value) {
          if (typeof item === 'string' && item.startsWith('$')) {
            const refQueryName = item;
            
            // Execute if needed
            if (!this.context.queryResults.has(refQueryName)) {
              const refQuery = this.queries[refQueryName];
              if (refQuery) {
                console.log(`[SimpleQueryExecutor] Implicit wait: executing ${refQueryName} before continuing`);
                const result = await this.executeQuery(refQueryName, refQuery);
                this.context.queryResults.set(refQueryName, result);
              }
            }
            
            // Get the result
            const result = this.context.queryResults.get(refQueryName);
            if (result !== undefined) {
              // If result is an array, spread it
              if (Array.isArray(result)) {
                resolved.push(...result);
              } else {
                resolved.push(result);
              }
            }
          } else if (typeof item === 'string' && item.startsWith('@')) {
            const actionName = item;
            const eventId = this.context.actionResults.get(actionName);
            if (eventId) {
              resolved.push(eventId);
            } else {
              // If action hasn't been executed, keep the unresolved reference
              // The safety check will prevent this query from executing
              resolved.push(item);
            }
          } else {
            resolved.push(item);
          }
        }
        config[key] = resolved;
      }
    }
  }
  
  private hasUnresolvedReferences(obj: any): boolean {
    // Check if any value in the object starts with @ or $ or is user.pubkey (unresolved reference)
    if (typeof obj === 'string') {
      return obj.startsWith('@') || obj.startsWith('$') || obj === 'user.pubkey';
    }
    if (Array.isArray(obj)) {
      return obj.some(item => this.hasUnresolvedReferences(item));
    }
    if (obj && typeof obj === 'object') {
      return Object.values(obj).some(value => this.hasUnresolvedReferences(value));
    }
    return false;
  }
  
  private resolveFilterVariables(filter: any): any {
    const resolved = { ...filter };
    
    // Resolve simple variables like "user.pubkey"
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string') {
        if (value === 'user.pubkey') {
          // Keep as unresolved if user not logged in
          if (!this.context.user.pubkey) {
            resolved[key] = 'user.pubkey';
          } else {
            resolved[key] = this.context.user.pubkey;
          }
        } else if (value === 'target.pubkey' && this.context.target?.pubkey) {
          resolved[key] = this.context.target.pubkey;
        } else if (value === 'target.id' && this.context.target?.id) {
          resolved[key] = this.context.target.id;
        } else if (value.includes('time.')) {
          // Handle time expressions
          try {
            const timeValue = value.replace('time.now', String(this.context.time.now));
            resolved[key] = eval(timeValue);
          } catch (e) {
            console.warn('Failed to evaluate time expression:', value);
          }
        }
      } else if (Array.isArray(value)) {
        // Resolve arrays
        resolved[key] = value.map(item => {
          if (typeof item === 'string') {
            if (item === 'user.pubkey') {
              // Keep as unresolved if user not logged in
              return this.context.user.pubkey || 'user.pubkey';
            }
            if (item === 'target.pubkey' && this.context.target?.pubkey) return this.context.target.pubkey;
            if (item === 'target.id' && this.context.target?.id) return this.context.target.id;
          }
          return item;
        });
      }
    }
    
    return resolved;
  }
}