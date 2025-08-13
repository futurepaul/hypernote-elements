/**
 * React Context and Hook for Query Planning System
 * Provides two-phase query execution to solve N+1 problem
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { QueryPlanner } from '../lib/QueryPlanner';
import type { Filter } from '../lib/snstr/client';
import type { NostrEvent } from '../lib/snstr/nip07';
import { useNostrStore } from '../stores/nostrStore';

interface QueryPlannerContextValue {
  planner: QueryPlanner;
  phase: 'planning' | 'executing' | 'complete';
  registerQuery: (
    id: string,
    filter: Filter,
    pipe?: any[],
    componentId?: string
  ) => void;
  getResults: (queryId: string) => NostrEvent[] | undefined;
  isReady: boolean;
}

const QueryPlannerContext = createContext<QueryPlannerContextValue | null>(null);

export function QueryPlannerProvider({ 
  children,
  queries,
  enabled = true
}: { 
  children: React.ReactNode;
  queries?: Record<string, any>;
  enabled?: boolean;
}) {
  const [phase, setPhase] = useState<'planning' | 'executing' | 'complete'>('planning');
  const plannerRef = useRef(new QueryPlanner());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const { snstrClient } = useNostrStore();
  
  // Track if we've started execution
  const executionStarted = useRef(false);
  
  const registerQuery = useCallback((
    id: string,
    filter: Filter,
    pipe?: any[],
    componentId?: string
  ) => {
    if (phase !== 'planning') {
      console.warn(`[QueryPlannerProvider] Cannot register query in ${phase} phase`);
      return;
    }
    plannerRef.current.addQuery(id, filter, pipe, componentId);
  }, [phase]);
  
  const getResults = useCallback((queryId: string) => {
    return plannerRef.current.getResults(queryId);
  }, []);
  
  // Execute queries after planning phase
  useEffect(() => {
    if (!enabled || !snstrClient) return;
    if (phase !== 'planning') return;
    if (executionStarted.current) return;
    
    // Wait a tick for all components to register their queries
    const timer = setTimeout(async () => {
      executionStarted.current = true;
      setPhase('executing');
      console.log('[QueryPlannerProvider] Starting execution phase');
      
      try {
        await plannerRef.current.execute(async (filter) => {
          return await snstrClient.fetchEvents([filter]);
        });
        
        console.log('[QueryPlannerProvider] Execution complete');
        setPhase('complete');
        // Trigger re-render to show results
        setRenderTrigger(prev => prev + 1);
      } catch (error) {
        console.error('[QueryPlannerProvider] Execution failed:', error);
        setPhase('complete');
      }
    }, 0);
    
    return () => clearTimeout(timer);
  }, [phase, snstrClient, enabled]);
  
  // Reset planner when queries change
  useEffect(() => {
    if (!enabled) return;
    
    console.log('[QueryPlannerProvider] Resetting planner for new queries');
    plannerRef.current.reset();
    executionStarted.current = false;
    setPhase('planning');
  }, [queries, enabled]);
  
  const value: QueryPlannerContextValue = {
    planner: plannerRef.current,
    phase,
    registerQuery,
    getResults,
    isReady: phase === 'complete'
  };
  
  return (
    <QueryPlannerContext.Provider value={value}>
      {children}
    </QueryPlannerContext.Provider>
  );
}

/**
 * Hook to use the query planner
 */
export function useQueryPlanner() {
  const context = useContext(QueryPlannerContext);
  if (!context) {
    // Return a dummy context if not in provider (backwards compatibility)
    return {
      planner: null,
      phase: 'complete' as const,
      registerQuery: () => {},
      getResults: () => undefined,
      isReady: false
    };
  }
  return context;
}

/**
 * Hook to register and execute a query with the planner
 */
export function usePlannedQuery(
  queryId: string,
  filter: Filter | null,
  pipe?: any[],
  componentId?: string
): { 
  data: NostrEvent[] | undefined; 
  loading: boolean;
} {
  const { registerQuery, getResults, phase, isReady } = useQueryPlanner();
  const registered = useRef(false);
  
  // Register query during planning phase
  useEffect(() => {
    if (!filter) return;
    if (phase !== 'planning') return;
    if (registered.current) return;
    
    console.log(`[usePlannedQuery] Registering query ${queryId}`);
    registerQuery(queryId, filter, pipe, componentId);
    registered.current = true;
  }, [queryId, filter, pipe, componentId, phase, registerQuery]);
  
  // Reset registration flag when filter changes
  useEffect(() => {
    registered.current = false;
  }, [filter]);
  
  // Get results after execution
  const data = isReady ? getResults(queryId) : undefined;
  const loading = !isReady;
  
  return { data, loading };
}