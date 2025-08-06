import { create } from 'zustand';
import { NostrEvent } from '../lib/snstr/nip07';
import { Filter } from '../lib/snstr/client';
import { useNostrStore } from './nostrStore';

interface Subscription {
  id: string;
  filters: Filter[];
  events: NostrEvent[];
  isActive: boolean;
  relaySubIds?: string[]; // Subscription IDs from each relay
}

interface SubscriptionStore {
  // State
  subscriptions: Map<string, Subscription>;
  
  // Actions
  createSubscription: (id: string, filters: Filter[]) => Promise<void>;
  updateSubscription: (id: string, filters: Filter[]) => Promise<void>;
  addEvent: (subscriptionId: string, event: NostrEvent) => void;
  removeSubscription: (id: string) => void;
  clearAllSubscriptions: () => void;
  getEvents: (subscriptionId: string) => NostrEvent[];
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  subscriptions: new Map(),
  
  createSubscription: async (id: string, filters: Filter[]) => {
    const { snstrClient } = useNostrStore.getState();
    if (!snstrClient) {
      console.error('SNSTR client not initialized');
      return;
    }
    
    // Check if subscription already exists with same filters
    const existing = get().subscriptions.get(id);
    if (existing && existing.isActive) {
      // Check if filters are the same
      const existingFiltersJson = JSON.stringify(existing.filters);
      const newFiltersJson = JSON.stringify(filters);
      
      if (existingFiltersJson === newFiltersJson) {
        console.log(`Subscription ${id} already exists with same filters, skipping`);
        return;
      } else {
        console.log(`Subscription ${id} exists but filters changed, updating...`);
        // Remove old subscription before creating new one
        get().removeSubscription(id);
      }
    }
    
    // Create new subscription
    const subscription: Subscription = {
      id,
      filters,
      events: [],
      isActive: true,
      relaySubIds: []
    };
    
    // Store events as they arrive
    const eventMap = new Map<string, NostrEvent>();
    
    try {
      // Create live subscription with SNSTR
      const subIds = await snstrClient.subscribe(
        filters,
        (event: NostrEvent, relay: string) => {
          // Deduplicate events by ID
          if (!eventMap.has(event.id)) {
            eventMap.set(event.id, event);
            
            // Add event to store
            set((state) => {
              const sub = state.subscriptions.get(id);
              if (sub) {
                // Insert in chronological order (newest first)
                const updatedEvents = [...sub.events];
                
                // Find insertion point
                let insertIndex = updatedEvents.findIndex(
                  e => e.created_at < event.created_at
                );
                
                if (insertIndex === -1) {
                  insertIndex = updatedEvents.length;
                }
                
                updatedEvents.splice(insertIndex, 0, event);
                
                // Create new subscription object with updated events
                const updatedSub = { ...sub, events: updatedEvents };
                const newSubs = new Map(state.subscriptions);
                newSubs.set(id, updatedSub);
                
                console.log(`Added event ${event.id} to subscription ${id} from ${relay}`);
                
                return { subscriptions: newSubs };
              }
              return state;
            });
          }
        },
        (relay: string) => {
          console.log(`EOSE received from ${relay} for subscription ${id}`);
        },
        0 // No timeout - keep subscription alive
      );
      
      subscription.relaySubIds = subIds;
      
      // Add subscription to store
      set((state) => {
        const newSubs = new Map(state.subscriptions);
        newSubs.set(id, subscription);
        return { subscriptions: newSubs };
      });
      
      console.log(`Created subscription ${id} with filters:`, filters);
      
      // Fetch initial events
      const initialEvents = await snstrClient.fetchEvents(filters);
      
      // Add initial events
      initialEvents.forEach(event => {
        if (!eventMap.has(event.id)) {
          eventMap.set(event.id, event);
          get().addEvent(id, event);
        }
      });
      
    } catch (error) {
      console.error(`Failed to create subscription ${id}:`, error);
      subscription.isActive = false;
      
      // Store failed subscription
      set((state) => {
        const newSubs = new Map(state.subscriptions);
        newSubs.set(id, subscription);
        return { subscriptions: newSubs };
      });
    }
  },
  
  updateSubscription: async (id: string, filters: Filter[]) => {
    // Remove old subscription
    get().removeSubscription(id);
    
    // Create new one with updated filters
    await get().createSubscription(id, filters);
  },
  
  addEvent: (subscriptionId: string, event: NostrEvent) => {
    set((state) => {
      const sub = state.subscriptions.get(subscriptionId);
      if (!sub) {
        console.warn(`Subscription ${subscriptionId} not found`);
        return state;
      }
      
      // Check if event already exists
      if (sub.events.some(e => e.id === event.id)) {
        return state;
      }
      
      // Insert in chronological order (newest first)
      const updatedEvents = [...sub.events];
      let insertIndex = updatedEvents.findIndex(
        e => e.created_at < event.created_at
      );
      
      if (insertIndex === -1) {
        insertIndex = updatedEvents.length;
      }
      
      updatedEvents.splice(insertIndex, 0, event);
      
      // Update subscription
      const updatedSub = { ...sub, events: updatedEvents };
      const newSubs = new Map(state.subscriptions);
      newSubs.set(subscriptionId, updatedSub);
      
      return { subscriptions: newSubs };
    });
  },
  
  removeSubscription: (id: string) => {
    const { snstrClient } = useNostrStore.getState();
    const sub = get().subscriptions.get(id);
    
    if (sub && sub.relaySubIds && snstrClient) {
      // Unsubscribe from relays
      // Note: We need to implement unsubscribe in SNSTR client
      console.log(`Removing subscription ${id}`);
    }
    
    set((state) => {
      const newSubs = new Map(state.subscriptions);
      newSubs.delete(id);
      return { subscriptions: newSubs };
    });
  },
  
  clearAllSubscriptions: () => {
    // Unsubscribe from all active subscriptions
    get().subscriptions.forEach((sub, id) => {
      get().removeSubscription(id);
    });
    
    set({ subscriptions: new Map() });
  },
  
  getEvents: (subscriptionId: string): NostrEvent[] => {
    const sub = get().subscriptions.get(subscriptionId);
    return sub?.events || [];
  }
}));

// Clean up subscriptions on window unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useSubscriptionStore.getState().clearAllSubscriptions();
  });
}