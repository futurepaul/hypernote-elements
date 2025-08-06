// Simplified SNSTR client wrapper for Hypernote
// This provides basic relay functionality without requiring private keys for queries

import { EventTemplate, NostrEvent } from "./nip07";

export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  "#e"?: string[];
  "#p"?: string[];
  "#t"?: string[];
  "#d"?: string[];
  "#a"?: string[];
  "#r"?: string[];
  search?: string;
}

export interface RelayStatus {
  url: string;
  connected: boolean;
  lastError?: string;
}

export interface SubscriptionCallbacks {
  onEvent?: (event: NostrEvent) => void;
  onEose?: () => void;
  onClose?: () => void;
}

// Simple WebSocket relay client
class SimpleRelay {
  private url: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private subscriptions = new Map<string, SubscriptionCallbacks>();
  private messageQueue: string[] = [];
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<boolean> {
    if (this.connected) return true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        const timeout = setTimeout(() => {
          reject(new Error(`Connection timeout for ${this.url}`));
          this.ws?.close();
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          this.reconnectAttempts = 0;
          console.log(`Connected to relay: ${this.url}`);
          
          // Send queued messages
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift();
            if (msg) this.ws?.send(msg);
          }
          
          resolve(true);
        };

        this.ws.onclose = () => {
          this.connected = false;
          clearTimeout(timeout);
          console.log(`Disconnected from relay: ${this.url}`);
          
          // Attempt reconnection
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error(`Relay error for ${this.url}:`, error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error("Failed to parse relay message:", error);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`Scheduling reconnect to ${this.url} in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(console.error);
    }, delay);
  }

  private handleMessage(message: any[]) {
    const [type, ...rest] = message;

    switch (type) {
      case "EVENT": {
        const [subId, event] = rest;
        const callbacks = this.subscriptions.get(subId);
        if (callbacks?.onEvent) {
          callbacks.onEvent(event as NostrEvent);
        }
        break;
      }
      case "EOSE": {
        const [subId] = rest;
        const callbacks = this.subscriptions.get(subId);
        if (callbacks?.onEose) {
          callbacks.onEose();
        }
        break;
      }
      case "CLOSED": {
        const [subId] = rest;
        const callbacks = this.subscriptions.get(subId);
        if (callbacks?.onClose) {
          callbacks.onClose();
        }
        this.subscriptions.delete(subId);
        break;
      }
      case "NOTICE": {
        const [notice] = rest;
        console.log(`Relay notice from ${this.url}: ${notice}`);
        break;
      }
      case "OK": {
        const [eventId, accepted, message] = rest;
        if (!accepted) {
          console.error(`Event ${eventId} rejected: ${message}`);
        }
        break;
      }
    }
  }

  subscribe(filters: Filter[], callbacks: SubscriptionCallbacks): string {
    const subId = Math.random().toString(36).substring(2, 15);
    this.subscriptions.set(subId, callbacks);

    const message = JSON.stringify(["REQ", subId, ...filters]);
    
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }

    return subId;
  }

  unsubscribe(subId: string) {
    this.subscriptions.delete(subId);
    
    const message = JSON.stringify(["CLOSE", subId]);
    
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    }
  }

  async publish(event: NostrEvent): Promise<void> {
    const message = JSON.stringify(["EVENT", event]);
    
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.subscriptions.clear();
    this.messageQueue = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  getUrl(): string {
    return this.url;
  }
}

// SNSTR Client that manages multiple relays
export class SNSTRClient {
  private relays: Map<string, SimpleRelay> = new Map();
  private relayUrls: string[] = [];
  private logger: (message: string) => void;

  constructor(relayUrls: string[], logger?: (message: string) => void) {
    this.relayUrls = relayUrls;
    this.logger = logger || console.log;
  }

  async connect(): Promise<void> {
    this.logger(`Connecting to ${this.relayUrls.length} relays...`);
    
    const connectionPromises = this.relayUrls.map(async (url) => {
      const relay = new SimpleRelay(url);
      this.relays.set(url, relay);
      
      try {
        await relay.connect();
        this.logger(`✅ Connected to ${url}`);
        return { url, success: true };
      } catch (error) {
        this.logger(`❌ Failed to connect to ${url}: ${error}`);
        return { url, success: false, error };
      }
    });

    const results = await Promise.allSettled(connectionPromises);
    
    const connected = results.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    
    this.logger(`Connected to ${connected}/${this.relayUrls.length} relays`);
  }

  disconnect() {
    this.relays.forEach(relay => relay.disconnect());
    this.relays.clear();
  }

  getRelayStatuses(): RelayStatus[] {
    return Array.from(this.relays.entries()).map(([url, relay]) => ({
      url,
      connected: relay.isConnected()
    }));
  }

  getConnectedRelays(): string[] {
    return Array.from(this.relays.entries())
      .filter(([_, relay]) => relay.isConnected())
      .map(([url, _]) => url);
  }

  // Subscribe to events from all connected relays
  async subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent, relay: string) => void,
    onEose?: (relay: string) => void,
    timeout: number = 30000
  ): Promise<string[]> {
    const subIds: string[] = [];
    const connectedRelays = this.getConnectedRelays();

    if (connectedRelays.length === 0) {
      throw new Error("No relays connected");
    }

    for (const url of connectedRelays) {
      const relay = this.relays.get(url);
      if (!relay) continue;

      const subId = relay.subscribe(filters, {
        onEvent: (event) => onEvent(event, url),
        onEose: () => onEose?.(url)
      });

      subIds.push(subId);
    }

    // Set up timeout
    if (timeout > 0) {
      setTimeout(() => {
        subIds.forEach((subId, index) => {
          const relay = this.relays.get(connectedRelays[index]);
          relay?.unsubscribe(subId);
        });
      }, timeout);
    }

    return subIds;
  }

  // Fetch events with EOSE (End of Stored Events) handling
  async fetchEvents(filters: Filter[], timeout: number = 5000): Promise<NostrEvent[]> {
    const events: NostrEvent[] = [];
    const seenIds = new Set<string>();
    const connectedRelays = this.getConnectedRelays();
    
    if (connectedRelays.length === 0) {
      throw new Error("No relays connected");
    }

    return new Promise((resolve) => {
      let eoseCount = 0;
      const subIds: string[] = [];

      const checkComplete = () => {
        if (eoseCount >= connectedRelays.length) {
          // Unsubscribe from all
          subIds.forEach((subId, index) => {
            const relay = this.relays.get(connectedRelays[index]);
            relay?.unsubscribe(subId);
          });
          resolve(events);
        }
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        subIds.forEach((subId, index) => {
          const relay = this.relays.get(connectedRelays[index]);
          relay?.unsubscribe(subId);
        });
        resolve(events);
      }, timeout);

      // Subscribe to each relay
      connectedRelays.forEach((url) => {
        const relay = this.relays.get(url);
        if (!relay) return;

        const subId = relay.subscribe(filters, {
          onEvent: (event) => {
            if (!seenIds.has(event.id)) {
              seenIds.add(event.id);
              events.push(event);
            }
          },
          onEose: () => {
            eoseCount++;
            checkComplete();
          }
        });

        subIds.push(subId);
      });
    });
  }

  // Publish event to all connected relays
  async publishEvent(event: NostrEvent): Promise<{ 
    eventId: string;
    successCount: number;
    results: Array<{ relay: string; success: boolean; error?: any }>;
  }> {
    const connectedRelays = this.getConnectedRelays();
    
    if (connectedRelays.length === 0) {
      throw new Error("No relays connected");
    }

    const publishPromises = connectedRelays.map(async (url) => {
      const relay = this.relays.get(url);
      if (!relay) {
        return { relay: url, success: false, error: "Relay not found" };
      }

      try {
        await relay.publish(event);
        return { relay: url, success: true };
      } catch (error) {
        return { relay: url, success: false, error };
      }
    });

    const results = await Promise.allSettled(publishPromises);
    const processedResults = results.map(r => 
      r.status === 'fulfilled' ? r.value : { relay: 'unknown', success: false, error: r.reason }
    );

    const successCount = processedResults.filter(r => r.success).length;

    return {
      eventId: event.id,
      successCount,
      results: processedResults
    };
  }
}