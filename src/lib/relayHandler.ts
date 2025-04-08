import type { Event, Filter } from 'nostr-tools';
import { getEventHash, SimplePool } from 'nostr-tools';
import { finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools';

export class RelayHandler {
  private pool: SimplePool;
  private relays: string[];
  private connections: Map<string, boolean> = new Map();
  private privateKey: Uint8Array;
  private logger: (message: string) => void;
  private subscriptions: Map<string, any> = new Map();

  constructor(urls: string[], privateKey: Uint8Array, logger: (message: string) => void) {
    this.privateKey = privateKey;
    this.logger = logger;
    this.relays = urls;
    this.pool = new SimplePool();
    
    this.relays.forEach(url => {
      this.connections.set(url, false);
      this.logger(`Initializing relay ${url}`);
    });
  }

  public getConnectionStatus(url: string): boolean {
    return this.connections.get(url) || false;
  }

  public async publishEvent(kind: number, content: string, tags: string[][] = []): Promise<string | null> {
    try {
      const pubkey = getPublicKey(this.privateKey);
      
      const event: any = {
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
        pubkey,
      };
      
      // Use finalizeEvent to compute the ID and generate a signature
      const signedEvent = finalizeEvent(event, this.privateKey);
      
      const pubs = this.pool.publish(this.relays, signedEvent);
      this.logger(`Publishing event to ${this.relays.length} relays`);
      
      await Promise.allSettled(pubs);
      
      return signedEvent.id;
    } catch (error) {
      this.logger(`Error publishing event: ${error}`);
      return null;
    }
  }

  public validateEvent(event: Event): boolean {
    try {
      // Use the standard verifyEvent function from nostr-tools
      return verifyEvent(event);
    } catch (error) {
      this.logger(`Error validating event: ${error}`);
      return false;
    }
  }

  public async subscribe(filters: Filter[], onEvent: (event: Event) => void): Promise<string> {
    const subscriptionId = Math.random().toString(36).substring(2, 15);
    
    try {
      this.logger(`Subscribing to events with filters: ${JSON.stringify(filters)}`);
      
      // According to nostr-tools docs, we need to handle events through the callback
      const unsub = this.pool.subscribeMany(
        this.relays,
        filters,
        {
          onevent: (event) => {
            this.logger(`Received event`);
            // Verify the event before passing it to the callback
            if (this.validateEvent(event)) {
              onEvent(event);
            } else {
              this.logger(`Received invalid event, ignoring`);
            }
          },
          oneose: () => {
            this.logger(`End of stored events`);
          }
        }
      );
      
      // Store the unsubscribe function
      this.subscriptions.set(subscriptionId, unsub);
      
      return subscriptionId;
    } catch (error) {
      this.logger(`Error subscribing: ${error}`);
      return subscriptionId;
    }
  }

  public unsubscribe(subscriptionId: string): void {
    const unsub = this.subscriptions.get(subscriptionId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(subscriptionId);
      this.logger(`Unsubscribed from ${subscriptionId}`);
    }
  }

  public cleanup() {
    try {
      // First unsubscribe from all subscriptions
      const subEntries = Array.from(this.subscriptions.values());
      for (const unsub of subEntries) {
        unsub();
      }
      this.subscriptions.clear();
      
      this.pool.close(this.relays);
      this.logger('Closed all relay connections');
    } catch (error) {
      this.logger(`Error closing connections: ${error}`);
    }
    
    this.connections.clear();
  }
} 