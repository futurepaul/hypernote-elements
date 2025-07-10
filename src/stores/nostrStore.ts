import { create } from "zustand";
import { getPublicKey } from "nostr-tools/pure";
import { RelayHandler } from "../lib/relayHandler";
import { QueryClient } from "@tanstack/react-query";
import { convertKey, getKeyType } from "../utils/nostr-keys";

// Create a QueryClient instance to be used throughout the app
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: false,
    },
  },
});

interface NostrStore {
  relayHandler: RelayHandler | null;
  privateKey: string | null;
  publicKey: string | null;
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
    'wss://nostr.wine/',
    'wss://relay.primal.net/',
    'wss://nostr.land/'
  ]
} as const;

export const useNostrStore = create<NostrStore>((set, get) => ({
  relayHandler: null,
  privateKey: null,
  publicKey: null,
  currentRelaySet: (localStorage.getItem('currentRelaySet') as RelaySet) || 'local',
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
    store.addLog("Initializing Nostr store...");
    
    let privkey = localStorage.getItem("privkey");

    if (!privkey) {
      const userInput = prompt("Please enter your Nostr key (npub, nsec, or hex)");
      if (userInput) {
        const keyType = getKeyType(userInput);
        store.addLog(`Detected key type: ${keyType}`);
        
        const conversion = convertKey(userInput);
        if (!conversion.success) {
          store.addLog(`❌ ${conversion.error}`);
          return;
        }
        
        if (!conversion.privateKeyHex) {
          store.addLog("❌ Cannot use public key only. Please provide private key (nsec or private hex).");
          store.addLog("💡 Your public key info:");
          store.addLog(`   npub: ${conversion.npub}`);
          store.addLog(`   hex: ${conversion.publicKeyHex}`);
          return;
        }
        
        // Success - we have a private key
        store.addLog(`✅ Key converted successfully!`);
        store.addLog(`   Your npub: ${conversion.npub}`);
        localStorage.setItem("privkey", conversion.privateKeyHex);
        localStorage.setItem("pubkey", conversion.publicKeyHex!);
        privkey = conversion.privateKeyHex;
      }
    }

    if (privkey) {
      const privkeyBytes = new Uint8Array(
        privkey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const pubkey = getPublicKey(privkeyBytes);
      
      // Log the generated pubkey for debugging
      store.addLog(`Generated pubkey: ${pubkey}`);
      
      // Store the public key in localStorage so it can be accessed by components
      localStorage.setItem("pubkey", pubkey);
      
      const currentRelayUrls = [...RELAY_SETS[get().currentRelaySet]];
      const handler = new RelayHandler(currentRelayUrls, privkeyBytes, store.addLog);
      
      set({ relayHandler: handler, privateKey: privkey, publicKey: pubkey });
      
      // Explicitly connect to relays
      try {
        await handler.connect();
        store.addLog("Successfully connected to relays");
        
        // Log final connection status
        const statuses = handler.getRelayStatuses();
        statuses.forEach(status => {
          store.addLog(`Relay ${status.url}: ${status.connected ? '✅ connected' : '❌ failed'}`);
        });
      } catch (error) {
        store.addLog(`Failed to connect to relays: ${error}`);
      }
    }
  },
  switchRelaySet: async (relaySet: RelaySet) => {
    const store = get();
    store.addLog(`Switching to ${relaySet} relay set...`);
    
    // Update current relay set and save to localStorage first
    localStorage.setItem('currentRelaySet', relaySet);
    set({ currentRelaySet: relaySet });
    
    // Cleanup existing connection
    if (store.relayHandler) {
      store.addLog("Cleaning up existing relay connections...");
      store.relayHandler.cleanup();
    }
    
    // Reinitialize with new relay set
    const privkey = store.privateKey;
    if (privkey) {
      const privkeyBytes = new Uint8Array(
        privkey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
      
      const newRelayUrls = [...RELAY_SETS[relaySet]];
      const handler = new RelayHandler(newRelayUrls, privkeyBytes, store.addLog);
      
      // Set the new handler before connecting
      set({ relayHandler: handler });
      
      // Connect to new relays
      try {
        await handler.connect();
        store.addLog(`Successfully connected to ${relaySet} relays`);
        
        // Log connection status
        const statuses = handler.getRelayStatuses();
        statuses.forEach(status => {
          store.addLog(`Relay ${status.url}: ${status.connected ? '✅ connected' : '❌ failed'}`);
        });
        
        // Clear query cache AFTER successful connection to force refetch with new relays
        queryClient.clear();
        store.addLog("Query cache cleared - data will refetch with new relays");
        
      } catch (error) {
        store.addLog(`Failed to connect to ${relaySet} relays: ${error}`);
        // Don't clear cache if connection failed
      }
    }
  },
  cleanup: () => {
    set((state) => {
      state.addLog("Cleaning up Nostr store...");
      state.relayHandler?.cleanup();
      queryClient.clear(); // Clear the query cache when cleaning up
      return { relayHandler: null };
    });
  },
})); 