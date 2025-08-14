import { useEffect, useRef, useState, useMemo } from 'react';
import { HypernoteExecutor, type ResolvedData, type ExecutorContext } from '../lib/HypernoteExecutor';
import { useNostrStore } from '../stores/nostrStore';
import { useAuthStore } from '../stores/authStore';
import { queryCache } from '../lib/queryCache';
import type { Hypernote } from '../lib/schema';

interface UseHypernoteExecutorOptions {
  target?: any;
  parentExtracted?: Record<string, any>;
  actionResults?: Map<string, string> | Record<string, string>;
}

/**
 * Simplified React hook that uses HypernoteExecutor for all logic
 */
export function useHypernoteExecutor(
  hypernote: Partial<Hypernote>,
  options?: UseHypernoteExecutorOptions
) {
  const [data, setData] = useState<ResolvedData>({
    queryResults: {},
    extractedVariables: {},
    loadingQueries: new Set()
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const executorRef = useRef<HypernoteExecutor>();
  const { snstrClient } = useNostrStore();
  const { pubkey, signEvent } = useAuthStore();
  
  // Hash the queries to detect changes
  const queriesHash = useMemo(() => {
    if (!hypernote.queries) return '';
    return JSON.stringify(hypernote.queries);
  }, [hypernote.queries]);
  
  useEffect(() => {
    // Skip if no queries or no client
    if (!hypernote.queries || Object.keys(hypernote.queries).length === 0) {
      setLoading(false);
      return;
    }
    
    if (!snstrClient) {
      setLoading(false);
      return;
    }
    
    // Create executor context
    const context: ExecutorContext = {
      user: { pubkey },
      target: options?.target,
      queryResults: new Map(),
      actionResults: (() => {
        // Convert actionResults to Map if it's a plain object
        if (options?.actionResults instanceof Map) {
          return options.actionResults;
        } else if (options?.actionResults) {
          return new Map(Object.entries(options.actionResults));
        }
        return new Map();
      })()
    };
    
    // Add parent extracted variables if provided
    if (options?.parentExtracted) {
      for (const [key, value] of Object.entries(options.parentExtracted)) {
        context.queryResults.set(key, value);
      }
    }
    
    // Create executor
    const executor = new HypernoteExecutor(
      hypernote,
      context,
      snstrClient,
      queryCache,
      signEvent
    );
    executorRef.current = executor;
    
    // Set up update callback
    executor.onUpdate = (newData) => {
      setData(prev => ({ ...prev, ...newData }));
    };
    
    // Execute queries
    const runQueries = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Phase 1: Static resolution (currently minimal)
        const staticData = executor.resolveStaticData();
        setData(staticData);
        
        // Phase 2: Execute queries
        const queryData = await executor.executeQueries();
        setData(queryData);
        
        // Phase 3: Live subscriptions are set up automatically in executeQueries
        
      } catch (err) {
        console.error('[useHypernoteExecutor] Error executing queries:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    
    runQueries();
    
    // Cleanup on unmount or query change
    return () => {
      if (executorRef.current) {
        executorRef.current.cleanup();
      }
    };
  }, [queriesHash, snstrClient, queryCache, pubkey, options?.target]);
  
  // Action execution function
  const executeAction = async (actionName: string, formData: Record<string, any>) => {
    if (!executorRef.current) {
      console.error('[useHypernoteExecutor] No executor available for action');
      return null;
    }
    
    return executorRef.current.executeAction(actionName, formData);
  };
  
  return {
    queryResults: data.queryResults,
    extractedVariables: data.extractedVariables,
    loading,
    error,
    executeAction
  };
}