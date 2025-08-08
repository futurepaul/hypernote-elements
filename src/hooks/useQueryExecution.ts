/**
 * React hook for executing Hypernote queries with dependency resolution
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { QueryExecutor, QueryContext } from '../lib/query-executor';
import { useAuthStore } from '../stores/authStore';
import { useNostrStore } from '../stores/nostrStore';
import type { NostrEvent } from '../lib/snstr/nip07';
import { queryCache } from '../lib/queryCache';

interface UseQueryExecutionResult {
  queryResults: Record<string, NostrEvent[]>;
  extractedVariables: Record<string, any>;
  loading: boolean;
  error: Error | null;
  allLoading?: boolean;
}

interface UseQueryExecutionOptions {
  target?: any; // Target context for components
  parentExtracted?: Record<string, any>; // Parent's extracted variables
}

/**
 * Hook that executes all queries in dependency order
 */
export function useQueryExecution(
  queries: Record<string, any>,
  options?: UseQueryExecutionOptions
): UseQueryExecutionResult {
  const [queryResults, setQueryResults] = useState<Record<string, NostrEvent[]>>({});
  const [extractedVariables, setExtractedVariables] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const { pubkey } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
  // Track active live subscriptions for this component instance
  const liveSubscriptions = useRef<Map<string, () => void>>(new Map());
  
  // Memoize queries to prevent re-execution on every render
  const queriesJson = JSON.stringify(queries);
  
  // Create a hash of the queries for change detection
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
  
  // Memoize context but include queriesHash in dependencies so it updates when queries change
  const context = useMemo<QueryContext>(() => ({
    user: { pubkey },
    target: options?.target || {},
    time: { now: 0 }, // Will be set during query execution
    extracted: options?.parentExtracted || {},
    results: new Map()
  }), [pubkey, options?.target, options?.parentExtracted, queriesHash]); // Re-create context when queries actually change
  
  useEffect(() => {
    if (!snstrClient) {
      setLoading(false);
      return;
    }
    
    let cancelled = false;
    
    const executeQueries = async () => {
      console.log('[useQueryExecution] Re-executing queries, SHA-256 hash:', queriesHash.substring(0, 16) + '...');
      try {
        setLoading(true);
        setError(null);
        
        // Create fetch function that uses snstrClient with caching
        const fetchEvents = async (filters: any): Promise<NostrEvent[]> => {
          // Handle arrays in filters (e.g., authors could be an array from extraction)
          const processedFilters = { ...filters };
          
          // If authors is a single-element array with another array inside, flatten it
          if (processedFilters.authors && 
              Array.isArray(processedFilters.authors) && 
              processedFilters.authors.length === 1 && 
              Array.isArray(processedFilters.authors[0])) {
            processedFilters.authors = processedFilters.authors[0];
          }
          
          // Use cache to deduplicate requests
          return await queryCache.getOrFetch(processedFilters, async (filter) => {
            console.log('Cache miss, fetching events with filter:', filter);
            return await snstrClient.fetchEvents([filter]);
          });
        };
        
        // Update context with current time
        context.time.now = Date.now();
        
        // Create and run executor
        const executor = new QueryExecutor(queries, context, fetchEvents);
        const results = await executor.executeAll();
        
        // console.log('Query results from executor:', results);
        // console.log('Extracted variables:', executor.getExtractedVariables());
        
        if (!cancelled) {
          // Convert Map to object for better React change detection
          const resultsObject: Record<string, NostrEvent[]> = {};
          results.forEach((value, key) => {
            resultsObject[key] = value;
          });
          setQueryResults(resultsObject);
          setExtractedVariables({ ...executor.getExtractedVariables() });
          
          // Set up live subscriptions for queries marked as live
          Object.entries(queries).forEach(([queryName, queryConfig]) => {
            if (queryConfig.live === true) {
              // Clean up any existing subscription for this query
              const existingSub = liveSubscriptions.current.get(queryName);
              if (existingSub) {
                existingSub();
              }
              
              // Recreate the context and re-process the query config with current extracted variables
              // This ensures we use the same logic as the initial query
              const currentContext = {
                user: { pubkey },
                time: { now: Date.now() },
                extracted: executor.getExtractedVariables(),
                results: new Map()
              };
              
              // Create a minimal executor just to process the variables
              const tempExecutor = new QueryExecutor({ [queryName]: queryConfig }, currentContext, fetchEvents);
              
              // Process the query config to substitute all variables
              const { pipe, live, ...filters } = queryConfig;
              const processedFilters = JSON.parse(JSON.stringify(filters)); // Deep clone
              
              // Substitute all variables in the filters
              Object.keys(processedFilters).forEach(key => {
                const value = processedFilters[key];
                if (typeof value === 'string') {
                  // Check for extracted variables (try both with and without $ prefix)
                  if (currentContext.extracted[value]) {
                    processedFilters[key] = currentContext.extracted[value];
                  } else if (value.startsWith('$') && currentContext.extracted[value.substring(1)]) {
                    processedFilters[key] = currentContext.extracted[value.substring(1)];
                  }
                  // Handle user.pubkey
                  else if (value === 'user.pubkey') {
                    processedFilters[key] = currentContext.user.pubkey;
                  }
                  // Handle time expressions
                  else if (value.includes('time.now')) {
                    try {
                      const timeNow = currentContext.time.now;
                      const result = value.replace(/time\.now/g, timeNow.toString());
                      const evaluated = new Function('return ' + result)();
                      // Convert to seconds for since/until
                      if (key === 'since' || key === 'until') {
                        processedFilters[key] = Math.floor(evaluated / 1000);
                      } else {
                        processedFilters[key] = evaluated;
                      }
                    } catch (e) {
                      console.warn(`Failed to evaluate time expression: ${value}`);
                    }
                  }
                }
              });
              
              // Flatten nested arrays in authors field if needed
              if (processedFilters.authors && 
                  Array.isArray(processedFilters.authors) && 
                  processedFilters.authors.length === 1 && 
                  Array.isArray(processedFilters.authors[0])) {
                processedFilters.authors = processedFilters.authors[0];
              }
              
              console.log(`[LIVE] Starting live subscription for ${queryName} with filters:`, processedFilters);
              
              // Create live subscription with the same filters used for initial fetch
              const cleanup = snstrClient.subscribeLive(
                [processedFilters],
                (event: NostrEvent) => {
                  console.log(`[LIVE] New event for ${queryName}:`, event.id);
                  // Add new event to the beginning of the array (newest first)
                  // But check for duplicates first
                  setQueryResults(prev => {
                    const existing = prev[queryName] || [];
                    // Check if this event already exists
                    if (existing.some(e => e.id === event.id)) {
                      console.log(`[LIVE] Skipping duplicate event ${event.id}`);
                      return prev;
                    }
                    return {
                      ...prev,
                      [queryName]: [event, ...existing]
                    };
                  });
                },
                () => {
                  console.log(`[LIVE] EOSE for ${queryName}`);
                }
              );
              
              liveSubscriptions.current.set(queryName, cleanup);
            }
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
      // Clean up all live subscriptions when component unmounts or queries change
      liveSubscriptions.current.forEach((cleanup, queryName) => {
        console.log(`[LIVE] Cleaning up subscription for ${queryName}`);
        cleanup();
      });
      liveSubscriptions.current.clear();
    };
  }, [queriesHash, context, snstrClient]); // Use hash instead of full JSON
  
  return {
    queryResults,
    extractedVariables,
    loading,
    error,
    allLoading: loading
  };
}