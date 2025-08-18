import { create } from "zustand";
import { SNSTRClient } from "../lib/snstr/client";
import { QueryClient } from "@tanstack/react-query";

// Create a QueryClient instance to be used throughout the app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds - much shorter for real-time updates
      retry: false,
    },
  },
});

interface NostrStore {
  relayHandler: any | null; // Temporarily keeping for compatibility
  snstrClient: SNSTRClient | null;
  currentRelaySet: RelaySet;
  logs: string[];
  addLog: (message: string) => void;
  initialize: () => Promise<void>;
  switchRelaySet: (relaySet: RelaySet) => Promise<void>;
  cleanup: () => void;
}

export type RelaySet = 'local' | 'test' | 'real';

export const RELAY_SETS = {
  local: ['ws://localhost:10547'],
  test: ['wss://relay.hypernote.dev'],
  real: [
    'wss://nos.lol/',
    'wss://relay.damus.io/',
    'wss://relay.primal.net/'
  ]
} as const;

export const useNostrStore = create<NostrStore>((set, get) => ({
  relayHandler: null,
  snstrClient: null,
  currentRelaySet: (() => {
    // Tests/non-browser: always use local
    if (typeof window === 'undefined') return 'local';
    // Dev (HMR): use saved or local
    if (import.meta.hot) {
      const saved = localStorage.getItem('currentRelaySet') as RelaySet | null;
      return saved || 'local';
    }
    // Browser production: use real
    return 'real';
  })(),
  logs: [],
  addLog: (message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    set((state) => ({
      logs: [...state.logs, `[${timestamp}] ${message}`],
    }));
  },
  initialize: async () => {
    const store = useNostrStore.getState();
    store.addLog("Initializing Nostr store with SNSTR client...");
    
    const currentRelayUrls = [...RELAY_SETS[get().currentRelaySet]];
    
    // Create SNSTR client
    const client = new SNSTRClient(currentRelayUrls, store.addLog);
    
    try {
      await client.connect();
      
      // Create a compatibility wrapper for existing code
      const compatibilityHandler = {
        relayUrls: currentRelayUrls,
        cleanup: () => client.disconnect(),
        getRelayStatuses: () => client.getRelayStatuses(),
        getConnectedRelays: () => client.getConnectedRelays(),
        // For compatibility with existing nostrFetch code
        subscribe: async (filters: any) => {
          // Use fetchEvents which returns a Promise<NostrEvent[]>
          return await client.fetchEvents(filters);
        },
        publishEvent: async (kind: number, content: string) => {
          // This will be updated to use NIP-07 signing
          throw new Error("Publishing requires NIP-07 authentication");
        }
      };
      
      set({ 
        snstrClient: client,
        relayHandler: compatibilityHandler 
      });
      
      store.addLog("SNSTR client initialized successfully");
      store.addLog("Using NIP-07 for authentication - no private keys stored!");
      
      // Log connection status
      const statuses = client.getRelayStatuses();
      statuses.forEach(status => {
        store.addLog(`Relay ${status.url}: ${status.connected ? '✅ connected' : '❌ failed'}`);
      });
    } catch (error) {
      store.addLog(`Failed to initialize SNSTR client: ${error}`);
    }
  },
  switchRelaySet: async (relaySet: RelaySet) => {
    const store = get();
    store.addLog(`Switching to ${relaySet} relay set...`);

    // Update current relay set and save to localStorage first
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('currentRelaySet', relaySet);
    }
    set({ currentRelaySet: relaySet });
    
    // Cleanup existing connection
    if (store.snstrClient) {
      store.addLog("Cleaning up existing relay connections...");
      store.snstrClient.disconnect();
    }
    
    // Create new SNSTR client with new relay set
    const newRelayUrls = [...RELAY_SETS[relaySet]];
    const client = new SNSTRClient(newRelayUrls, store.addLog);
    
    try {
      await client.connect();
      
      // Create compatibility wrapper
      const compatibilityHandler = {
        relayUrls: newRelayUrls,
        cleanup: () => client.disconnect(),
        getRelayStatuses: () => client.getRelayStatuses(),
        getConnectedRelays: () => client.getConnectedRelays(),
        // For compatibility with existing nostrFetch code
        subscribe: async (filters: any) => {
          // Use fetchEvents which returns a Promise<NostrEvent[]>
          return await client.fetchEvents(filters);
        },
        publishEvent: async (kind: number, content: string) => {
          throw new Error("Publishing requires NIP-07 authentication");
        }
      };
      
      set({ 
        snstrClient: client,
        relayHandler: compatibilityHandler 
      });
      
      store.addLog(`Successfully connected to ${relaySet} relays`);
      
      // Log connection status
      const statuses = client.getRelayStatuses();
      statuses.forEach(status => {
        store.addLog(`Relay ${status.url}: ${status.connected ? '✅ connected' : '❌ failed'}`);
      });
      
      // Clear query cache to force refetch with new relays
      queryClient.clear();
      store.addLog("Query cache cleared - data will refetch with new relays");
    } catch (error) {
      store.addLog(`Failed to connect to ${relaySet} relays: ${error}`);
    }
  },
  cleanup: () => {
    set((state) => {
      state.addLog("Cleaning up Nostr store...");
      state.snstrClient?.disconnect();
      state.relayHandler?.cleanup();
      queryClient.clear(); // Clear the query cache when cleaning up
      return { relayHandler: null, snstrClient: null };
    });
  },
})); 