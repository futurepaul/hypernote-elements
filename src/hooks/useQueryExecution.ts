/**
 * React hook for executing Hypernote queries with dependency resolution
 */

import { useState, useEffect, useMemo } from 'react';
import { QueryExecutor, QueryContext } from '../lib/query-executor';
import { useAuthStore } from '../stores/authStore';
import { useNostrStore } from '../stores/nostrStore';
import { NostrEvent } from '../lib/snstr/nip07';

interface UseQueryExecutionResult {
  queryResults: Record<string, NostrEvent[]>;
  extractedVariables: Record<string, any>;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook that executes all queries in dependency order
 */
export function useQueryExecution(
  queries: Record<string, any>
): UseQueryExecutionResult {
  const [queryResults, setQueryResults] = useState<Record<string, NostrEvent[]>>({});
  const [extractedVariables, setExtractedVariables] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const { pubkey } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
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
    time: { now: 0 }, // Will be set during query execution
    extracted: {},
    results: new Map()
  }), [pubkey, queriesHash]); // Re-create context when queries actually change
  
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
        
        // Create fetch function that uses snstrClient
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
          
          console.log('Fetching events with filters:', processedFilters);
          // SNSTRClient.fetchEvents expects an array of filters, so wrap in array
          return await snstrClient.fetchEvents([processedFilters]);
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
          console.log('[useQueryExecution] Setting results:', Object.keys(resultsObject).map(k => `${k}: ${resultsObject[k].length} items`));
          setQueryResults(resultsObject);
          setExtractedVariables({ ...executor.getExtractedVariables() });
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
    };
  }, [queriesHash, context, snstrClient]); // Use hash instead of full JSON
  
  return {
    queryResults,
    extractedVariables,
    loading,
    error
  };
}