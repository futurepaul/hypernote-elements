/**
 * Batches target resolution requests to avoid N+1 queries
 * Collects all profile fetch requests and executes them in a single batch
 */

import type { SNSTRClient } from './snstr/client';
import type { NostrEvent } from './snstr/nip07';
import type { TargetContext } from './componentResolver';

interface PendingTarget {
  pubkey: string;
  resolve: (target: TargetContext) => void;
  reject: (error: Error) => void;
}

export class TargetBatcher {
  private pendingTargets: PendingTarget[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private client: SNSTRClient;
  private profileCache = new Map<string, TargetContext>();
  
  constructor(client: SNSTRClient) {
    this.client = client;
  }
  
  /**
   * Request a target profile - will be batched with other requests
   */
  async getTarget(pubkey: string): Promise<TargetContext> {
    // Check cache first
    const cached = this.profileCache.get(pubkey);
    if (cached) {
      console.log(`[TargetBatcher] Using cached profile for ${pubkey.substring(0, 8)}...`);
      return cached;
    }
    
    return new Promise((resolve, reject) => {
      // Add to pending
      this.pendingTargets.push({ pubkey, resolve, reject });
      
      // Schedule batch execution
      if (!this.batchTimer) {
        // Use setImmediate to batch all synchronous requests
        this.batchTimer = setTimeout(() => this.executeBatch(), 0);
      }
    });
  }
  
  /**
   * Execute all pending target fetches in a single batch
   */
  private async executeBatch() {
    this.batchTimer = null;
    
    if (this.pendingTargets.length === 0) return;
    
    // Extract unique pubkeys
    const uniquePubkeys = Array.from(new Set(this.pendingTargets.map(t => t.pubkey)));
    console.log(`[TargetBatcher] Batching ${this.pendingTargets.length} requests for ${uniquePubkeys.length} unique profiles`);
    
    try {
      // Fetch all profiles in one request
      const filter = {
        kinds: [0],
        authors: uniquePubkeys,
        limit: uniquePubkeys.length
      };
      
      console.log(`[TargetBatcher] Fetching batch with filter:`, filter);
      const events = await this.client.fetchEvents([filter]);
      
      // Create a map of pubkey -> profile
      const profileMap = new Map<string, NostrEvent>();
      for (const event of events) {
        profileMap.set(event.pubkey, event);
      }
      
      // Resolve all pending requests
      for (const pending of this.pendingTargets) {
        const event = profileMap.get(pending.pubkey);
        
        if (event) {
          try {
            const profileData = JSON.parse(event.content);
            const target: TargetContext = {
              pubkey: pending.pubkey,
              name: profileData.name,
              picture: profileData.picture,
              nip05: profileData.nip05,
              raw: pending.pubkey
            };
            
            // Cache for future use
            this.profileCache.set(pending.pubkey, target);
            
            pending.resolve(target);
          } catch (error) {
            console.error(`[TargetBatcher] Failed to parse profile for ${pending.pubkey}:`, error);
            // Return minimal target on parse error
            const target: TargetContext = {
              pubkey: pending.pubkey,
              raw: pending.pubkey
            };
            this.profileCache.set(pending.pubkey, target);
            pending.resolve(target);
          }
        } else {
          // No profile found, return minimal target
          const target: TargetContext = {
            pubkey: pending.pubkey,
            raw: pending.pubkey
          };
          this.profileCache.set(pending.pubkey, target);
          pending.resolve(target);
        }
      }
      
      console.log(`[TargetBatcher] Batch complete, resolved ${this.pendingTargets.length} requests`);
    } catch (error) {
      console.error('[TargetBatcher] Batch fetch failed:', error);
      // Reject all pending
      for (const pending of this.pendingTargets) {
        pending.reject(error as Error);
      }
    } finally {
      // Clear pending list
      this.pendingTargets = [];
    }
  }
  
  /**
   * Clear the cache
   */
  clearCache() {
    this.profileCache.clear();
  }
}

// Global instance
let globalBatcher: TargetBatcher | null = null;

export function getTargetBatcher(client?: SNSTRClient): TargetBatcher | null {
  if (!client && !globalBatcher) return null;
  
  if (client && !globalBatcher) {
    globalBatcher = new TargetBatcher(client);
  }
  
  return globalBatcher;
}

export function clearTargetBatcher() {
  if (globalBatcher) {
    globalBatcher.clearCache();
  }
  globalBatcher = null;
}