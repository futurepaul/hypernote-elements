/**
 * Simplified React hook for executing Hypernote queries
 * Uses implicit dependency resolution via direct references
 */

import { useState, useEffect, useRef } from 'react';
import { SimpleQueryExecutor } from '../lib/simple-query-executor';
import { useAuthStore } from '../stores/authStore';
import { useNostrStore } from '../stores/nostrStore';
import type { NostrEvent } from '../lib/snstr/nip07';
import { queryCache } from '../lib/queryCache';

interface UseQueryExecutionResult {
  queryResults: Record<string, any>;
  extractedVariables: Record<string, any>; // Keeping for compatibility, always empty
  loading: boolean;
  error: Error | null;
  allLoading?: boolean;
}

interface UseQueryExecutionOptions {
  target?: any; // Target context for components
  parentExtracted?: Record<string, any>; // Ignored - no more extracted variables
  actionResults?: Record<string, string>; // Published event IDs from actions
  onTriggerAction?: (actionName: string) => void; // Callback to trigger actions
}

/**
 * Hook that executes all queries with implicit dependency resolution
 */
export function useQueryExecution(
  queries: Record<string, any>,
  options?: UseQueryExecutionOptions
): UseQueryExecutionResult {
  const [queryResults, setQueryResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const { pubkey } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
  // Track active live subscriptions
  const liveSubscriptions = useRef<Map<string, () => void>>(new Map());
  
  // Track query triggers (query name -> action to trigger)
  const queryTriggers = useRef<Map<string, string>>(new Map());
  
  // Track which triggers have already fired for a specific value
  // Key: queryName, Value: JSON stringified value that was triggered
  const firedTriggers = useRef<Map<string, string>>(new Map());
  
  // Hash queries for change detection
  const queriesJson = JSON.stringify(queries);
  const [queriesHash, setQueriesHash] = useState<string>('');
  
  useEffect(() => {
    const hashQueries = async () => {
      const encoder = new TextEncoder();
      const data = encoder.encode(queriesJson);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setQueriesHash(hashHex);
    };
    hashQueries();
  }, [queriesJson]);
  
  // Check and execute triggers when query results change
  useEffect(() => {
    if (!options?.onTriggerAction) return;
    
    // Check each query trigger
    queryTriggers.current.forEach((actionName, queryName) => {
      const result = queryResults[queryName];
      
      // Skip if result is undefined (query hasn't executed yet)
      if (result === undefined) {
        return;
      }
      
      // Check if result is truthy
      const isTruthy = result !== null && 
                      !(Array.isArray(result) && result.length === 0) &&
                      result !== '';
      
      // Skip if result is falsy
      if (!isTruthy) {
        // Clear fired trigger when result becomes falsy
        firedTriggers.current.delete(queryName);
        return;
      }
      
      // Check if we've already fired for this exact value
      const resultStr = JSON.stringify(result);
      const lastFiredValue = firedTriggers.current.get(queryName);
      const alreadyFired = lastFiredValue === resultStr;
      
      // Only trigger if we haven't already fired for this exact value
      if (!alreadyFired) {
        console.log(`[Trigger] Query ${queryName} value changed, triggering action "${actionName}"`);
        // Pass the action name as-is (with @ prefix)
        options.onTriggerAction(actionName);
        
        // Remember that we fired for this value
        firedTriggers.current.set(queryName, resultStr);
      }
    });
  }, [queryResults, options?.onTriggerAction]);
  
  useEffect(() => {
    console.log('[useQueryExecution] Effect triggered - pubkey:', pubkey);
    
    if (!snstrClient) {
      setLoading(false);
      return;
    }
    
    // Skip if target is invalid (for components)
    if (options?.target && (!options.target.pubkey || options.target.pubkey === 'undefined')) {
      console.log('[useQueryExecution] Skipping - invalid target context:', options.target);
      setLoading(false);
      return;
    }
    
    // Log target if present for debugging
    if (options?.target) {
      console.log('[useQueryExecution] Target context:', options.target);
    }
    
    let cancelled = false;
    
    const executeQueries = async () => {
      console.log('[useQueryExecution] Executing queries, hash:', queriesHash.substring(0, 16) + '...');
      console.log('[useQueryExecution] Number of queries:', Object.keys(queries).length);
      
      try {
        setLoading(true);
        setError(null);
        
        // Clear and rebuild query triggers map
        queryTriggers.current.clear();
        // Don't clear firedTriggers here - we want to remember what we've already triggered
        Object.entries(queries).forEach(([queryName, queryConfig]) => {
          if (queryConfig.triggers) {
            console.log(`[Triggers] Registering trigger: ${queryName} -> "${queryConfig.triggers}"`);
            queryTriggers.current.set(queryName, queryConfig.triggers);
          }
        });
        
        // Create fetch function with caching
        const fetchEvents = async (filter: any): Promise<NostrEvent[]> => {
          // Flatten nested arrays in filters if needed
          const processedFilter = { ...filter };
          if (processedFilter.authors && 
              Array.isArray(processedFilter.authors) && 
              processedFilter.authors.length === 1 && 
              Array.isArray(processedFilter.authors[0])) {
            processedFilter.authors = processedFilter.authors[0];
          }
          
          // Use cache
          return await queryCache.getOrFetch(processedFilter, async (f) => {
            console.log('[useQueryExecution] Cache miss, fetching:', f);
            return await snstrClient.fetchEvents([f]);
          });
        };
        
        // Convert action results to Map
        const actionResultsMap = new Map<string, string>();
        if (options?.actionResults) {
          Object.entries(options.actionResults).forEach(([key, value]) => {
            // Key already includes @ prefix (e.g., "@increment")
            actionResultsMap.set(key, value);
          });
        }
        
        // Create simple executor
        const executor = new SimpleQueryExecutor(
          queries,
          {
            user: { pubkey },
            target: options?.target,
            queryResults: new Map(),
            actionResults: actionResultsMap,
          },
          fetchEvents
        );
        
        // Execute all queries
        const results = await executor.executeAll();
        console.log('[useQueryExecution] Executor returned results Map:', results);
        
        if (!cancelled) {
          // Convert Map to object
          const resultsObject: Record<string, any> = {};
          results.forEach((value, key) => {
            resultsObject[key] = value;
          });
          console.log('[useQueryExecution] Setting query results:', resultsObject);
          setQueryResults(resultsObject);
          
          // Set up live subscriptions (all queries are live by default)
          // Clean up old subscriptions first
          liveSubscriptions.current.forEach((cleanup) => cleanup());
          liveSubscriptions.current.clear();
          
          // Create new subscriptions
          Object.entries(queries).forEach(([queryName, queryConfig]) => {
            const { pipe, triggers, ...filter } = queryConfig;
            
            // Resolve filter variables
            const resolvedFilter = { ...filter };
            
            // Simple variable resolution
            Object.keys(resolvedFilter).forEach(key => {
              const value = resolvedFilter[key];
              if (value === 'user.pubkey') {
                resolvedFilter[key] = pubkey || 'user.pubkey'; // Keep unresolved if no pubkey
              } else if (Array.isArray(value)) {
                resolvedFilter[key] = value.map(v => {
                  // Resolve user.pubkey
                  if (v === 'user.pubkey') {
                    return pubkey || 'user.pubkey';
                  }
                  // Resolve action references
                  if (typeof v === 'string' && v.startsWith('@')) {
                    const eventId = actionResultsMap.get(v);
                    return eventId || v; // Keep unresolved if no event ID
                  }
                  // Resolve query references
                  if (typeof v === 'string' && v.startsWith('$')) {
                    const queryResult = resultsObject[v];
                    return queryResult || v; // Keep unresolved if no result
                  }
                  return v;
                });
              } else if (typeof value === 'string' && value.startsWith('@')) {
                // Resolve single action reference
                const eventId = actionResultsMap.get(value);
                resolvedFilter[key] = eventId || value;
              }
            });
            
            // Safety check: Don't create live subscription with unresolved references
            const hasUnresolvedRefs = (obj: any): boolean => {
              if (typeof obj === 'string') {
                return obj.startsWith('@') || obj.startsWith('$') || obj === 'user.pubkey';
              }
              if (Array.isArray(obj)) {
                return obj.some(item => hasUnresolvedRefs(item));
              }
              if (obj && typeof obj === 'object') {
                return Object.values(obj).some(value => hasUnresolvedRefs(value));
              }
              return false;
            };
            
            if (hasUnresolvedRefs(resolvedFilter)) {
              console.log(`[LIVE] Skipping subscription for ${queryName} - has unresolved references:`, resolvedFilter);
              return;
            }
            
            console.log(`[LIVE] Starting subscription for ${queryName}`);
            
            const cleanup = snstrClient.subscribeLive(
              [resolvedFilter],
              async (event: NostrEvent) => {
                console.log(`[LIVE] New event for ${queryName}:`, event.id);
                
                // For queries with pipes, re-fetch all and re-apply pipes
                if (pipe && pipe.length > 0) {
                  const allEvents = await snstrClient.fetchEvents([resolvedFilter]);
                  const { applyPipes } = await import('../lib/pipes');
                  const processed = applyPipes(allEvents, pipe);
                  
                  setQueryResults(prev => ({
                    ...prev,
                    [queryName]: processed
                  }));
                } else {
                  // Add new event to results
                  setQueryResults(prev => {
                    const existing = prev[queryName];
                    if (!Array.isArray(existing)) return prev;
                    if (existing.some(e => e.id === event.id)) return prev;
                    
                    return {
                      ...prev,
                      [queryName]: [event, ...existing]
                    };
                  });
                }
              },
              () => {
                console.log(`[LIVE] EOSE for ${queryName}`);
              }
            );
            
            liveSubscriptions.current.set(queryName, cleanup);
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Query execution error:', err);
          setError(err instanceof Error ? err : new Error('Query execution failed'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    executeQueries();
    
    return () => {
      cancelled = true;
      // Clean up live subscriptions
      liveSubscriptions.current.forEach((cleanup) => {
        cleanup();
      });
      liveSubscriptions.current.clear();
    };
  }, [queriesHash, snstrClient, pubkey, options?.target, options?.actionResults]);
  
  // Clear fired triggers when queries change (but not when action results change)
  useEffect(() => {
    firedTriggers.current.clear();
  }, [queriesHash]);
  
  return {
    queryResults,
    extractedVariables: {}, // Always empty now - no more extracted variables
    loading,
    error,
    allLoading: loading
  };
}