/**
 * Manages and deduplicates live subscriptions
 * Ensures we don't create multiple subscriptions for the same filter
 */

import type { Filter } from './snstr/client';
import type { NostrEvent } from './snstr/nip07';

interface SubscriptionInfo {
  filter: Filter;
  filterKey: string;
  callbacks: Set<(event: NostrEvent) => void>;
  cleanup?: () => void;
}

export class SubscriptionManager {
  private subscriptions = new Map<string, SubscriptionInfo>();
  
  /**
   * Generate a stable key from a filter for deduplication
   */
  private getFilterKey(filter: Filter): string {
    // Sort keys for consistent hashing
    const sorted = Object.keys(filter).sort().reduce((obj, key) => {
      const value = filter[key];
      // Sort arrays for consistency
      if (Array.isArray(value)) {
        obj[key] = [...value].sort();
      } else {
        obj[key] = value;
      }
      return obj;
    }, {} as any);
    return JSON.stringify(sorted);
  }
  
  /**
   * Add a subscription, deduplicating if the same filter already exists
   */
  addSubscription(
    filter: Filter,
    callback: (event: NostrEvent) => void,
    createSubscription: (filter: Filter, callback: (event: NostrEvent) => void) => () => void
  ): () => void {
    const filterKey = this.getFilterKey(filter);
    
    // Check if we already have a subscription for this filter
    let info = this.subscriptions.get(filterKey);
    
    if (info) {
      console.log('[SubscriptionManager] Reusing existing subscription for filter:', filterKey.substring(0, 50) + '...');
      // Add callback to existing subscription
      info.callbacks.add(callback);
      
      // Return cleanup function that removes just this callback
      return () => {
        info!.callbacks.delete(callback);
        // If no more callbacks, clean up the subscription
        if (info!.callbacks.size === 0) {
          console.log('[SubscriptionManager] No more callbacks, cleaning up subscription');
          if (info!.cleanup) {
            info!.cleanup();
          }
          this.subscriptions.delete(filterKey);
        }
      };
    }
    
    // Create new subscription
    console.log('[SubscriptionManager] Creating new subscription for filter:', filterKey.substring(0, 50) + '...');
    
    const callbacks = new Set<(event: NostrEvent) => void>();
    callbacks.add(callback);
    
    // Create multiplexed callback that calls all registered callbacks
    const multiplexedCallback = (event: NostrEvent) => {
      callbacks.forEach(cb => {
        try {
          cb(event);
        } catch (error) {
          console.error('[SubscriptionManager] Error in callback:', error);
        }
      });
    };
    
    // Create the actual subscription
    const cleanup = createSubscription(filter, multiplexedCallback);
    
    info = {
      filter,
      filterKey,
      callbacks,
      cleanup
    };
    
    this.subscriptions.set(filterKey, info);
    
    // Return cleanup function
    return () => {
      const subInfo = this.subscriptions.get(filterKey);
      if (subInfo) {
        subInfo.callbacks.delete(callback);
        // If no more callbacks, clean up the subscription
        if (subInfo.callbacks.size === 0) {
          console.log('[SubscriptionManager] No more callbacks, cleaning up subscription');
          if (subInfo.cleanup) {
            subInfo.cleanup();
          }
          this.subscriptions.delete(filterKey);
        }
      }
    };
  }
  
  /**
   * Get active subscription count
   */
  getActiveCount(): number {
    return this.subscriptions.size;
  }
  
  /**
   * Clear all subscriptions
   */
  clear() {
    this.subscriptions.forEach(info => {
      if (info.cleanup) {
        info.cleanup();
      }
    });
    this.subscriptions.clear();
  }
}

// Global instance for the entire app
export const globalSubscriptionManager = new SubscriptionManager();