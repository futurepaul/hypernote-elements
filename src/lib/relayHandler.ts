import type { Event, Filter } from 'nostr-tools';
import { getEventHash, SimplePool } from 'nostr-tools';
import { finalizeEvent, getPublicKey, generateSecretKey } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools';

export interface RelayStatus {
  url: string;
  connected: boolean;
  lastConnected?: number;
  lastError?: string;
}

export interface PublishResult {
  relay: string;
  success: boolean;
  error?: string;
}

export class RelayHandler {
  private pool: SimplePool;
  private relays: string[];
  private privateKey: Uint8Array;
  private logger: (message: string) => void;
  private subscriptions: Map<string, any> = new Map();
  private relayStatuses: Map<string, RelayStatus> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private isConnecting = false;
  private connectionTimeout = 10000; // 10 seconds
  private subscriptionTimeout = 10000; // 10 seconds

  constructor(urls: string[], privateKey: Uint8Array, logger: (message: string) => void) {
    this.privateKey = privateKey;
    this.logger = logger;
    this.relays = urls;
    this.pool = new SimplePool();
    
    // Initialize relay statuses
    this.relays.forEach(url => {
      this.relayStatuses.set(url, {
        url,
        connected: false
      });
    });
    
    // Set up connection monitoring
    this.setupConnectionMonitoring();
  }

  private setupConnectionMonitoring() {
    // Note: nostr-tools SimplePool doesn't expose connection events
    // This would be where we'd monitor connection status in a production system
    // For now, we'll track connection attempts manually
  }

  /**
   * Explicitly connect to all relays
   * Should be called early in application lifecycle
   */
  public async connect(): Promise<void> {
    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.logger('Connecting to relays...');

    this.connectionPromise = this.performConnection();
    
    try {
      await this.connectionPromise;
      this.logger('Successfully connected to relays');
    } catch (error) {
      this.logger(`Connection failed: ${error}`);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  private async performConnection(): Promise<void> {
    // Test connectivity by performing a simple query on each relay
    const connectionTests = this.relays.map(async (relay) => {
      try {
        const testFilter: Filter = { kinds: [1], limit: 1 };
        
        // Use a timeout for the connection test
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), this.connectionTimeout);
        });

        const testPromise = new Promise<void>((resolve) => {
          const sub = this.pool.subscribeMany(
            [relay],
            [testFilter],
            {
              onevent: () => {
                // Got an event, connection works
                resolve();
              },
              oneose: () => {
                // Got EOSE, connection works
                resolve();
              }
            }
          );

          // Clean up subscription after test
          setTimeout(() => {
            if (typeof sub === 'function') sub();
          }, 1000);
        });

        await Promise.race([testPromise, timeoutPromise]);
        
        this.updateRelayStatus(relay, true);
        this.logger(`✅ Connected to relay: ${relay}`);
        
      } catch (error) {
        this.updateRelayStatus(relay, false, error.message);
        this.logger(`❌ Failed to connect to relay: ${relay} - ${error.message}`);
      }
    });

    // Wait for all connection attempts
    await Promise.allSettled(connectionTests);
    
    const connectedCount = Array.from(this.relayStatuses.values())
      .filter(status => status.connected).length;
    
    if (connectedCount === 0) {
      throw new Error('Failed to connect to any relays');
    }
    
    this.logger(`Connected to ${connectedCount}/${this.relays.length} relays`);
  }

  private updateRelayStatus(url: string, connected: boolean, error?: string) {
    const status = this.relayStatuses.get(url);
    if (status) {
      status.connected = connected;
      status.lastConnected = connected ? Date.now() : status.lastConnected;
      status.lastError = error;
    }
  }

  public getRelayStatuses(): RelayStatus[] {
    return Array.from(this.relayStatuses.values());
  }

  public getConnectedRelays(): string[] {
    return this.relays.filter(relay => 
      this.relayStatuses.get(relay)?.connected
    );
  }

  /**
   * Publish event with detailed per-relay results
   */
  public async publishEvent(kind: number, content: string, tags: string[][] = []): Promise<{
    eventId: string;
    results: PublishResult[];
    successCount: number;
  }> {
    const pubkey = getPublicKey(this.privateKey);
    
    const event: any = {
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
      pubkey,
    };
    
    const signedEvent = finalizeEvent(event, this.privateKey);
    
    // Only publish to connected relays
    const connectedRelays = this.getConnectedRelays();
    
    if (connectedRelays.length === 0) {
      throw new Error('No connected relays available for publishing');
    }
    
    this.logger(`Publishing event to ${connectedRelays.length} connected relays`);
    
    const publishPromises = this.pool.publish(connectedRelays, signedEvent);
    const results = await Promise.allSettled(publishPromises);
    
    const publishResults: PublishResult[] = results.map((result, index) => ({
      relay: connectedRelays[index],
      success: result.status === 'fulfilled',
      error: result.status === 'rejected' ? result.reason?.message : undefined
    }));
    
    const successCount = publishResults.filter(r => r.success).length;
    
    // Log results
    publishResults.forEach(result => {
      if (result.success) {
        this.logger(`✅ Published to ${result.relay}`);
      } else {
        this.logger(`❌ Failed to publish to ${result.relay}: ${result.error}`);
      }
    });
    
    if (successCount === 0) {
      throw new Error('Failed to publish to any relays');
    }
    
    return {
      eventId: signedEvent.id,
      results: publishResults,
      successCount
    };
  }

  /**
   * Subscribe with live updates - keeps subscription open after EOSE
   * Returns a cleanup function to unsubscribe
   */
  public subscribeLive(
    filters: Filter[],
    onEvent: (event: Event) => void,
    onEose?: () => void,
    options: {
      requireMinRelays?: number;
    } = {}
  ): () => void {
    const subscriptionId = Math.random().toString(36).substring(2, 15);
    const minRelays = options.requireMinRelays || 1;
    
    const connectedRelays = this.getConnectedRelays();
    
    if (connectedRelays.length < minRelays) {
      throw new Error(`Need at least ${minRelays} connected relays, have ${connectedRelays.length}`);
    }
    
    this.logger(`Starting LIVE subscription on ${connectedRelays.length} relays with filters: ${JSON.stringify(filters)}`);
    
    let eoseCount = 0;
    const targetEoseCount = connectedRelays.length;
    let hasCalledEose = false;
    
    const sub = this.pool.subscribeMany(
      connectedRelays,
      filters,
      {
        onevent: (event) => {
          if (this.validateEvent(event)) {
            this.logger(`[LIVE] Received event: ${event.id}`);
            onEvent(event);
          } else {
            this.logger(`[LIVE] Received invalid event: ${event.id}`);
          }
        },
        oneose: () => {
          eoseCount++;
          this.logger(`[LIVE] EOSE from relay (${eoseCount}/${targetEoseCount})`);
          
          // Call onEose only once when all relays have sent EOSE
          if (eoseCount >= targetEoseCount && !hasCalledEose && onEose) {
            hasCalledEose = true;
            onEose();
          }
        }
      }
    );
    
    this.subscriptions.set(subscriptionId, sub);
    
    // Return cleanup function
    return () => {
      this.logger(`Closing LIVE subscription ${subscriptionId}`);
      const subscription = this.subscriptions.get(subscriptionId);
      if (subscription) {
        subscription.close();
        this.subscriptions.delete(subscriptionId);
      }
    };
  }

  /**
   * Subscribe with better error handling and timeout management
   */
  public async subscribe(
    filters: Filter[], 
    onEvent?: (event: Event) => void,
    options: {
      timeout?: number;
      requireMinRelays?: number;
    } = {}
  ): Promise<string | Event[]> {
    const subscriptionId = Math.random().toString(36).substring(2, 15);
    const timeout = options.timeout || this.subscriptionTimeout;
    const minRelays = options.requireMinRelays || 1;
    
    const connectedRelays = this.getConnectedRelays();
    
    if (connectedRelays.length < minRelays) {
      throw new Error(`Need at least ${minRelays} connected relays, have ${connectedRelays.length}`);
    }
    
    this.logger(`Subscribing to events on ${connectedRelays.length} relays with filters: ${JSON.stringify(filters)}`);
    
    try {
      // If no callback is provided, collect events and return them
      if (!onEvent) {
        const events: Event[] = [];
        let eoseCount = 0;
        const targetEoseCount = connectedRelays.length;
        
        await new Promise<void>((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.logger(`Subscription timeout after ${timeout}ms. Collected ${events.length} events from ${eoseCount}/${targetEoseCount} relays.`);
            resolve();
          }, timeout);

          const sub = this.pool.subscribeMany(
            connectedRelays,
            filters,
            {
              onevent: (event) => {
                if (this.validateEvent(event)) {
                  this.logger(`Received event: ${event.id}`);
                  events.push(event);
                } else {
                  this.logger(`Received invalid event: ${event.id}`);
                }
              },
              oneose: () => {
                eoseCount++;
                this.logger(`EOSE from relay (${eoseCount}/${targetEoseCount}). Total events: ${events.length}`);
                
                // Resolve when we get EOSE from all relays or timeout
                if (eoseCount >= targetEoseCount) {
                  clearTimeout(timeoutId);
                  resolve();
                }
              }
            }
          );
          
          this.subscriptions.set(subscriptionId, sub);
        });
        
        return events;
      }
      
      // Callback-based subscription
      const unsub = this.pool.subscribeMany(
        connectedRelays,
        filters,
        {
          onevent: (event) => {
            if (this.validateEvent(event)) {
              this.logger(`Received event: ${event.id}`);
              onEvent(event);
            } else {
              this.logger(`Received invalid event, ignoring: ${event.id}`);
            }
          },
          oneose: () => {
            this.logger(`End of stored events for subscription ${subscriptionId}`);
          }
        }
      );
      
      this.subscriptions.set(subscriptionId, unsub);
      return subscriptionId;
      
    } catch (error) {
      this.logger(`Error subscribing: ${error}`);
      throw error;
    }
  }

  public validateEvent(event: Event): boolean {
    try {
      return verifyEvent(event);
    } catch (error) {
      this.logger(`Error validating event: ${error}`);
      return false;
    }
  }

  public unsubscribe(subscriptionId: string): void {
    const unsub = this.subscriptions.get(subscriptionId);
    if (unsub && typeof unsub === 'function') {
      unsub();
      this.subscriptions.delete(subscriptionId);
      this.logger(`Unsubscribed from ${subscriptionId}`);
    }
  }

  public cleanup() {
    try {
      // Unsubscribe from all subscriptions
      const subEntries = Array.from(this.subscriptions.values());
      for (const unsub of subEntries) {
        if (typeof unsub === 'function') {
          unsub();
        }
      }
      this.subscriptions.clear();
      
      // Close pool connections
      this.pool.close(this.relays);
      this.logger('Closed all relay connections');
      
      // Reset connection states
      this.relayStatuses.forEach(status => {
        status.connected = false;
      });
      
    } catch (error) {
      this.logger(`Error during cleanup: ${error}`);
    }
  }
}