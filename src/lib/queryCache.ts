/**
 * Global query cache to prevent duplicate requests
 * Shares results across all components
 */

import type { NostrEvent } from './snstr/nip07';
import type { Filter } from './snstr/client';

interface CacheEntry {
  filter: Filter;
  events: NostrEvent[];
  timestamp: number;
  promise?: Promise<NostrEvent[]>;
}

class QueryCache {
  private cache = new Map<string, CacheEntry>();
  private ttl = 60000; // 1 minute cache TTL
  
  /**
   * Generate a cache key from a filter
   */
  private getCacheKey(filter: Filter): string {
    // Sort keys for consistent hashing
    const sorted = Object.keys(filter).sort().reduce((obj, key) => {
      obj[key] = filter[key];
      return obj;
    }, {} as any);
    return JSON.stringify(sorted);
  }
  
  /**
   * Get cached events if available and not expired
   */
  get(filter: Filter): NostrEvent[] | null {
    const key = this.getCacheKey(filter);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if cache is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.events;
  }
  
  /**
   * Get or fetch events with deduplication
   * Multiple calls with the same filter will share the same promise
   */
  async getOrFetch(
    filter: Filter, 
    fetcher: (filter: Filter) => Promise<NostrEvent[]>
  ): Promise<NostrEvent[]> {
    const key = this.getCacheKey(filter);
    const existing = this.cache.get(key);
    
    // Return cached if fresh
    if (existing && Date.now() - existing.timestamp <= this.ttl) {
      return existing.events;
    }
    
    // If there's an in-flight request, wait for it
    if (existing?.promise) {
      return existing.promise;
    }
    
    // Start new fetch
    const promise = fetcher(filter);
    
    // Store promise immediately to prevent duplicate requests
    this.cache.set(key, {
      filter,
      events: [],
      timestamp: Date.now(),
      promise
    });
    
    try {
      const events = await promise;
      
      // Update cache with results
      this.cache.set(key, {
        filter,
        events,
        timestamp: Date.now()
      });
      
      return events;
    } catch (error) {
      // Remove failed entry
      this.cache.delete(key);
      throw error;
    }
  }
  
  /**
   * Set cache entry manually
   */
  set(filter: Filter, events: NostrEvent[]) {
    const key = this.getCacheKey(filter);
    this.cache.set(key, {
      filter,
      events,
      timestamp: Date.now()
    });
  }
  
  /**
   * Invalidate a specific cache entry
   */
  invalidate(filter: Filter) {
    const key = this.getCacheKey(filter);
    this.cache.delete(key);
  }
  
  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }
  
  /**
   * Clear expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global singleton instance
export const queryCache = new QueryCache();