/**
 * Enhanced version of useQueryExecution that integrates with QueryPlanner
 * Falls back to regular execution if no planner is available
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryPlanner } from './useQueryPlanner';
import { useQueryExecution } from './useQueryExecution';
import type { Filter } from '../lib/snstr/client';
import type { NostrEvent } from '../lib/snstr/nip07';

interface UseQueryExecutionResult {
  queryResults: Record<string, any>;
  extractedVariables: Record<string, any>;
  loading: boolean;
  error: Error | null;
  allLoading?: boolean;
}

interface UseQueryExecutionOptions {
  target?: any;
  parentExtracted?: Record<string, any>;
  actionResults?: Record<string, string>;
  onTriggerAction?: (actionName: string) => void;
}

/**
 * Smart hook that uses QueryPlanner when available, falls back to regular execution
 */
export function useQueryExecutionWithPlanner(
  queries: Record<string, any>,
  options?: UseQueryExecutionOptions
): UseQueryExecutionResult {
  const plannerContext = useQueryPlanner();
  const [queryResults, setQueryResults] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const registered = useRef(false);
  const componentId = useRef(`component-${Math.random().toString(36).substr(2, 9)}`);
  
  // Check if we're in a QueryPlanner context and should use it
  const hasPlanner = plannerContext !== null;
  const phase = plannerContext?.phase;
  const registerQuery = plannerContext?.registerQuery;
  const getResults = plannerContext?.getResults;
  const isReady = plannerContext?.isReady;
  
  // Register queries during planning phase
  useEffect(() => {
    if (!hasPlanner) return;
    if (phase !== 'planning') return;
    if (registered.current) return;
    if (!queries || Object.keys(queries).length === 0) return;
    
    console.log(`[useQueryExecutionWithPlanner] Registering ${Object.keys(queries).length} queries for component ${componentId.current}`);
    
    // Register each query with the planner
    Object.entries(queries).forEach(([queryName, queryConfig]) => {
      const { pipe, triggers, ...filter } = queryConfig;
      
      // Resolve filter variables (similar to what useQueryExecution does)
      const resolvedFilter = resolveFilterVariables(filter, options);
      
      // Skip if has unresolved references
      if (hasUnresolvedReferences(resolvedFilter)) {
        console.log(`[useQueryExecutionWithPlanner] Skipping ${queryName} - has unresolved references`);
        return;
      }
      
      if (registerQuery) {
        registerQuery(
          `${componentId.current}-${queryName}`,
          resolvedFilter,
          pipe,
          componentId.current
        );
      }
    });
    
    registered.current = true;
  }, [queries, phase, hasPlanner, registerQuery, options]);
  
  // Get results after execution
  useEffect(() => {
    if (!hasPlanner) return;
    if (!isReady) return;
    
    const results: Record<string, any> = {};
    Object.keys(queries).forEach(queryName => {
      const queryId = `${componentId.current}-${queryName}`;
      const queryResult = getResults(queryId);
      if (queryResult !== undefined) {
        results[queryName] = queryResult;
      }
    });
    
    // Only log if we actually got results
    if (Object.keys(results).length > 0) {
      console.log(`[useQueryExecutionWithPlanner] Got results for component ${componentId.current}:`, Object.keys(results));
    }
    setQueryResults(results);
    setLoading(false);
  }, [isReady, queries, getResults, hasPlanner]);
  
  // Fall back to regular execution if no planner
  const regularExecution = useQueryExecution(
    hasPlanner ? {} : queries, // Only use regular execution if no planner
    options
  );
  
  // Return planner results if available, otherwise regular results
  if (hasPlanner) {
    return {
      queryResults,
      extractedVariables: {},
      loading: !isReady,
      error: null,
      allLoading: !isReady
    };
  } else {
    return regularExecution;
  }
}

/**
 * Resolve filter variables (copied from useQueryExecution logic)
 */
function resolveFilterVariables(filter: any, options?: UseQueryExecutionOptions): any {
  const resolved = { ...filter };
  
  // Simple variable resolution
  Object.keys(resolved).forEach(key => {
    const value = resolved[key];
    
    if (value === 'target.pubkey' && options?.target?.pubkey) {
      resolved[key] = options.target.pubkey;
    } else if (value === 'target.id' && options?.target?.id) {
      resolved[key] = options.target.id;
    } else if (Array.isArray(value)) {
      resolved[key] = value.map(v => {
        if (v === 'target.pubkey' && options?.target?.pubkey) {
          return options.target.pubkey;
        }
        if (v === 'target.id' && options?.target?.id) {
          return options.target.id;
        }
        return v;
      });
    }
  });
  
  return resolved;
}

/**
 * Check for unresolved references
 */
function hasUnresolvedReferences(obj: any): boolean {
  if (typeof obj === 'string') {
    return obj.startsWith('@') || obj.startsWith('$') || 
           obj === 'user.pubkey' || obj === 'target.pubkey' || obj === 'target.id';
  }
  if (Array.isArray(obj)) {
    return obj.some(item => hasUnresolvedReferences(item));
  }
  if (obj && typeof obj === 'object') {
    return Object.values(obj).some(value => hasUnresolvedReferences(value));
  }
  return false;
}