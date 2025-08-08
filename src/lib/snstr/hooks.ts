import { useEffect, useRef, useState, useMemo } from 'react';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { Filter } from './client';
import { NostrEvent } from './nip07';

// Stable empty array reference to avoid infinite re-renders
const EMPTY_EVENTS: NostrEvent[] = [];

/**
 * React hook for creating reactive Nostr subscriptions
 * Automatically updates when new events arrive
 */
export function useNostrSubscription(
  filters: Filter[] | null,
  stableId?: string // Optional stable ID for the subscription
): {
  events: NostrEvent[];
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Use provided stable ID or generate one ONCE
  const subscriptionId = useMemo(
    () => stableId || `sub_${Math.random().toString(36).substring(2, 9)}`,
    [stableId] // Only regenerate if stableId changes
  );
  
  // Memoize the filters JSON to prevent infinite loops
  const filtersJson = useMemo(
    () => filters ? JSON.stringify(filters) : null,
    [JSON.stringify(filters)]
  );
  
  // Get events from the store (this will re-render when events update)
  // Use stable empty array reference to avoid infinite re-renders
  const events = useSubscriptionStore((state) => 
    state.subscriptions.get(subscriptionId)?.events || EMPTY_EVENTS
  );
  
  useEffect(() => {
    console.log('[useNostrSubscription] Effect running:', {
      subscriptionId,
      filters,
      filtersJson,
      timestamp: Date.now()
    });
    
    // Skip if no filters
    if (!filters || filters.length === 0) {
      setLoading(false);
      return;
    }
    
    const setupSubscription = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('[useNostrSubscription] Creating subscription:', subscriptionId);
        // Get the store actions directly to avoid stale closures
        const { createSubscription } = useSubscriptionStore.getState();
        // Create or update subscription
        await createSubscription(subscriptionId, filters);
        setLoading(false);
      } catch (err) {
        console.error('Failed to setup subscription:', err);
        setError(err instanceof Error ? err : new Error('Failed to setup subscription'));
        setLoading(false);
      }
    };
    
    setupSubscription();
    
    // No cleanup here - we handle it in a separate effect
  }, [filtersJson, subscriptionId]); // Depend on stable values only
  
  // Clean up subscription on unmount
  useEffect(() => {
    const id = subscriptionId;
    return () => {
      if (id) {
        const { removeSubscription } = useSubscriptionStore.getState();
        removeSubscription(id);
      }
    };
  }, [subscriptionId]); // Depend on subscriptionId
  
  return { events, loading, error };
}

/**
 * Hook for managing multiple subscriptions
 */
export function useMultipleSubscriptions(
  subscriptions: Array<{ id: string; filters: Filter[] }>
): Map<string, NostrEvent[]> {
  const [results, setResults] = useState<Map<string, NostrEvent[]>>(new Map());
  const { createSubscription, removeSubscription } = useSubscriptionStore();
  
  // Get all events from store
  const allSubscriptions = useSubscriptionStore((state) => state.subscriptions);
  
  useEffect(() => {
    const setupSubscriptions = async () => {
      for (const { id, filters } of subscriptions) {
        try {
          await createSubscription(id, filters);
        } catch (err) {
          console.error(`Failed to setup subscription ${id}:`, err);
        }
      }
    };
    
    setupSubscriptions();
    
    // Cleanup
    return () => {
      subscriptions.forEach(({ id }) => {
        removeSubscription(id);
      });
    };
  }, [JSON.stringify(subscriptions)]);
  
  // Update results when subscriptions change
  useEffect(() => {
    const newResults = new Map<string, NostrEvent[]>();
    
    subscriptions.forEach(({ id }) => {
      const sub = allSubscriptions.get(id);
      if (sub) {
        newResults.set(id, sub.events);
      }
    });
    
    setResults(newResults);
  }, [allSubscriptions, subscriptions]);
  
  return results;
}