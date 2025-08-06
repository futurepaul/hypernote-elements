/**
 * React hook for executing Hypernote queries with dependency resolution
 */

import { useState, useEffect, useMemo } from 'react';
import { QueryExecutor, QueryContext } from '../lib/query-executor';
import { useAuthStore } from '../stores/authStore';
import { useNostrStore } from '../stores/nostrStore';
import { NostrEvent } from '../lib/snstr/nip07';

interface UseQueryExecutionResult {
  queryResults: Map<string, NostrEvent[]>;
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
  const [queryResults, setQueryResults] = useState<Map<string, NostrEvent[]>>(new Map());
  const [extractedVariables, setExtractedVariables] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const { pubkey } = useAuthStore();
  const { snstrClient } = useNostrStore();
  
  // Memoize the context to prevent unnecessary re-executions
  const context = useMemo<QueryContext>(() => ({
    user: { pubkey },
    time: { now: Date.now() },
    extracted: {},
    results: new Map()
  }), [pubkey]);
  
  // Memoize queries to prevent re-execution on every render
  const queriesJson = JSON.stringify(queries);
  
  useEffect(() => {
    if (!snstrClient) {
      setLoading(false);
      return;
    }
    
    let cancelled = false;
    
    const executeQueries = async () => {
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
        
        // Create and run executor
        const executor = new QueryExecutor(queries, context, fetchEvents);
        const results = await executor.executeAll();
        
        if (!cancelled) {
          setQueryResults(results);
          setExtractedVariables(executor.getExtractedVariables());
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
  }, [queriesJson, context, snstrClient]);
  
  return {
    queryResults,
    extractedVariables,
    loading,
    error
  };
}