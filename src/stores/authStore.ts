import { create } from "zustand";
import { 
  hasNip07Support, 
  getPublicKey as nip07GetPublicKey, 
  signEvent as nip07SignEvent,
  type NostrEvent,
  type EventTemplate
} from "../lib/snstr/nip07";

interface AuthStore {
  // State
  isAuthenticated: boolean;
  pubkey: string | null;
  hasExtension: boolean;
  isConnecting: boolean;
  error: string | null;
  
  // Actions
  checkExtension: () => void;
  login: () => Promise<void>;
  logout: () => void;
  signEvent: (template: EventTemplate) => Promise<NostrEvent>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  pubkey: null,
  hasExtension: false,
  isConnecting: false,
  error: null,
  
  // Check if extension is available
  checkExtension: () => {
    const currentHasExtension = get().hasExtension;
    const newHasExtension = hasNip07Support();
    
    // Only update state if the value actually changed
    if (currentHasExtension !== newHasExtension) {
      console.log("NIP-07 extension status changed:", {
        oldValue: currentHasExtension,
        newValue: newHasExtension
      });
      set({ hasExtension: newHasExtension });
      
      if (newHasExtension) {
        console.log("Extension found!");
        // Clear any previous error when extension is detected
        set({ error: null });
      } else {
        console.log("No extension found. window.nostr:", window?.nostr);
      }
    }
  },
  
  // Login with NIP-07 extension
  login: async () => {
    const state = get();
    
    if (!state.hasExtension) {
      state.checkExtension();
      if (!get().hasExtension) {
        return;
      }
    }
    
    set({ isConnecting: true, error: null });
    
    try {
      const pubkey = await nip07GetPublicKey();
      
      set({ 
        pubkey,
        isAuthenticated: true,
        isConnecting: false,
        error: null
      });
      
      // Store in localStorage for persistence
      localStorage.setItem("nip07_pubkey", pubkey);
      
      console.log("Successfully logged in with NIP-07. Pubkey:", pubkey);
    } catch (error) {
      console.error("Failed to login with NIP-07:", error);
      set({ 
        isConnecting: false,
        error: error instanceof Error ? error.message : "Failed to connect to Nostr extension"
      });
    }
  },
  
  // Logout
  logout: () => {
    localStorage.removeItem("nip07_pubkey");
    set({ 
      isAuthenticated: false,
      pubkey: null,
      error: null
    });
    console.log("Logged out from NIP-07");
  },
  
  // Sign event with NIP-07
  signEvent: async (template: EventTemplate): Promise<NostrEvent> => {
    const state = get();
    
    if (!state.isAuthenticated || !state.pubkey) {
      throw new Error("Not authenticated. Please login first.");
    }
    
    if (!state.hasExtension) {
      throw new Error("No Nostr extension available");
    }
    
    try {
      // Ensure created_at is set
      const eventToSign = {
        ...template,
        created_at: template.created_at || Math.floor(Date.now() / 1000),
        tags: template.tags || []
      };
      
      const signedEvent = await nip07SignEvent(eventToSign);
      return signedEvent;
    } catch (error) {
      console.error("Failed to sign event:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to sign event with extension"
      );
    }
  },
  
  // Clear error
  clearError: () => {
    set({ error: null });
  }
}));

// Auto-check for extension and stored pubkey on initialization
if (typeof window !== "undefined") {
  const store = useAuthStore.getState();
  store.checkExtension();
  
  // Check if user was previously logged in
  const storedPubkey = localStorage.getItem("nip07_pubkey");
  if (storedPubkey && store.hasExtension) {
    // Verify the extension still has access to this pubkey
    nip07GetPublicKey()
      .then(pubkey => {
        if (pubkey === storedPubkey) {
          useAuthStore.setState({ 
            pubkey,
            isAuthenticated: true 
          });
          console.log("Restored NIP-07 session. Pubkey:", pubkey);
        } else {
          // Pubkey changed, clear stored data
          localStorage.removeItem("nip07_pubkey");
        }
      })
      .catch(() => {
        // Extension no longer has access, clear stored data
        localStorage.removeItem("nip07_pubkey");
      });
  }
}