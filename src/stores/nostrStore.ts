import { create } from "zustand";
import { getPublicKey } from "nostr-tools/pure";
import { RelayHandler } from "../lib/relayHandler";

interface NostrStore {
  relayHandler: RelayHandler | null;
  privateKey: string | null;
  publicKey: string | null;
  logs: string[];
  addLog: (message: string) => void;
  initialize: () => void;
  cleanup: () => void;
  queryResponses: Record<string, any>;
  setQueryResponse: (id: string, response: any) => void;
  slots: Record<string, { queryId: string; field: string; value: any }>;
  registerSlot: (slotId: string, queryId: string, field: string) => void;
  getSlotValue: (slotId: string) => any;
}

const RELAY_URLS = [
  'ws://localhost:10547' // IT'S NAK
  // 'wss://relay.nostr.net',
  // 'wss://relay.damus.io',
  // 'wss://relay.snort.social',
  // 'wss://relay.nostr.band'
]

export const useNostrStore = create<NostrStore>((set, get) => ({
  relayHandler: null,
  privateKey: null,
  publicKey: null,
  logs: [],
  queryResponses: {},
  slots: {},
  setQueryResponse: (id: string, response: any) => {
    set((state) => {
      const newQueryResponses = {
        ...state.queryResponses,
        [id]: response,
      };

      const newSlots = { ...state.slots };
      Object.entries(newSlots).forEach(([slotId, slot]) => {
        if (slot.queryId === id) {
          newSlots[slotId] = {
            ...slot,
            value: response[slot.field],
          };
        }
      });

      return {
        queryResponses: newQueryResponses,
        slots: newSlots,
      };
    });
  },
  registerSlot: (slotId: string, queryId: string, field: string) => {
    set((state) => {
      const queryResponse = state.queryResponses[queryId];
      return {
        slots: {
          ...state.slots,
          [slotId]: {
            queryId,
            field,
            value: queryResponse?.[field],
          },
        },
      };
    });
  },
  getSlotValue: (slotId: string) => {
    return get().slots[slotId]?.value;
  },
  addLog: (message: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    set((state) => ({
      logs: [...state.logs, `[${timestamp}] ${message}`],
    }));
  },
  initialize: () => {
    const store = useNostrStore.getState();
    store.addLog("Initializing Nostr store...");
    
    let privkey = localStorage.getItem("privkey");

    if (!privkey) {
      const newPrivkey = prompt("Please enter your private key");
      if (newPrivkey) {
        localStorage.setItem("privkey", newPrivkey);
        privkey = newPrivkey;
      }
    }

    if (privkey) {
      const privkeyBytes = new Uint8Array(
        privkey.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );
      const pubkey = getPublicKey(privkeyBytes);
      const handler = new RelayHandler(RELAY_URLS, privkeyBytes, store.addLog);
      
      RELAY_URLS.forEach(url => {
        const status = handler.getConnectionStatus(url);
        store.addLog(`Initial relay ${url} connection status: ${status ? 'connected' : 'disconnected'}`);
      });
      
      set({ relayHandler: handler, privateKey: privkey, publicKey: pubkey });
    }
  },
  cleanup: () => {
    set((state) => {
      state.addLog("Cleaning up Nostr store...");
      state.relayHandler?.cleanup();
      return { relayHandler: null };
    });
  },
})); 