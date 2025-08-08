// NIP-07 Browser Extension Support
// Simplified version based on snstr

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface EventTemplate {
  kind: number;
  content: string;
  tags?: string[][];
  created_at?: number;
}

interface NostrWindow {
  getPublicKey(): Promise<string>;
  signEvent(event: Omit<NostrEvent, "id" | "pubkey" | "sig">): Promise<NostrEvent>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: NostrWindow;
  }
}

function getNostr(): NostrWindow | undefined {
  if (typeof window === "undefined") return undefined;
  return window.nostr;
}

export const hasNip07Support = (): boolean => {
  return typeof window !== "undefined" && !!getNostr();
};

export const getPublicKey = async (): Promise<string> => {
  const nostr = getNostr();
  if (!nostr) {
    throw new Error("NIP-07 extension not available");
  }
  
  try {
    return await nostr.getPublicKey();
  } catch (error) {
    throw new Error(`Failed to get public key from NIP-07 extension: ${error}`);
  }
};

export const signEvent = async (
  event: Omit<NostrEvent, "id" | "pubkey" | "sig">
): Promise<NostrEvent> => {
  const nostr = getNostr();
  if (!nostr) {
    throw new Error("NIP-07 extension not available");
  }
  
  try {
    return await nostr.signEvent(event);
  } catch (error) {
    throw new Error(`Failed to sign event with NIP-07 extension: ${error}`);
  }
};