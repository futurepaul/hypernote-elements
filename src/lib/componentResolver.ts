import { nip19 } from 'nostr-tools';
import type { Hypernote } from './schema';
import type { SNSTRClient } from './snstr/client';
import type { Filter } from './snstr/client';
import { queryCache } from './queryCache';

/**
 * Manages fetching and caching of Hypernote components
 */
export class ComponentResolver {
  private cache = new Map<string, Hypernote>();
  private fetchPromises = new Map<string, Promise<Hypernote>>();
  private client: SNSTRClient | null = null;
  
  constructor(client?: SNSTRClient) {
    this.client = client || null;
  }
  
  setClient(client: SNSTRClient) {
    this.client = client;
  }

  /**
   * Pre-fetch all components referenced in imports
   * @param imports Map of aliases to Nostr identifiers
   */
  async prefetchComponents(imports: Record<string, string> | undefined): Promise<void> {
    if (!imports) return;
    
    const fetches = Object.entries(imports).map(([alias, reference]) => 
      this.fetchComponent(reference)
        .then(component => {
          // Store without # prefix
          const key = alias.startsWith('#') ? alias.slice(1) : alias;
          this.cache.set(key, component);
          console.log(`[ComponentResolver] Cached component ${key}`);
        })
        .catch(error => {
          console.error(`[ComponentResolver] Failed to fetch component ${alias}:`, error);
          // Don't throw - allow other components to load
        })
    );
    
    await Promise.all(fetches);
  }

  /**
   * Get cached component definition
   * @param alias Component alias (with or without # prefix)
   */
  getComponent(alias: string): Hypernote | null {
    // Remove # prefix if present
    const key = alias.startsWith('#') ? alias.slice(1) : alias;
    return this.cache.get(key) || null;
  }

  /**
   * Fetch component by reference (naddr/nevent)
   * @param reference Nostr identifier
   */
  private async fetchComponent(reference: string): Promise<Hypernote> {
    // Check if we're already fetching this reference
    if (this.fetchPromises.has(reference)) {
      return this.fetchPromises.get(reference)!;
    }

    // Create fetch promise
    const fetchPromise = this.doFetch(reference);
    this.fetchPromises.set(reference, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      // Clean up promise cache
      this.fetchPromises.delete(reference);
    }
  }

  private async doFetch(reference: string): Promise<Hypernote> {
    if (!this.client) {
      console.warn('SNSTRClient not initialized yet. Cannot fetch component:', reference);
      throw new Error('SNSTRClient not initialized. Cannot fetch components.');
    }
    
    console.log(`Fetching component from relays: ${reference}`);
    
    try {
      // 1. Decode the naddr
      const decoded = nip19.decode(reference);
      if (decoded.type !== 'naddr') {
        throw new Error(`Expected naddr, got ${decoded.type}`);
      }
      
      const { identifier, pubkey, kind } = decoded.data;
      
      // 2. Create filter for the replaceable event
      const filter: Filter = {
        kinds: [kind],
        authors: [pubkey],
        '#d': [identifier],
        limit: 1
      };
      
      console.log(`Fetching component with filter:`, JSON.stringify(filter));
      
      // 3. Fetch from relays using cache to prevent duplicates
      const events = await queryCache.getOrFetch(filter, async (f) => {
        console.log('Cache miss for component, fetching from relays');
        return await this.client.fetchEvents([f]);
      });
      
      if (events.length === 0) {
        throw new Error(`Component not found: ${reference}`);
      }
      
      const event = events[0];
      console.log(`Fetched event:`, event.id);
      
      // 4. Parse the content as JSON
      let content: any;
      try {
        content = JSON.parse(event.content);
      } catch (e) {
        throw new Error(`Failed to parse component content as JSON: ${e}`);
      }
      
      // 5. Validate it's a valid component
      if (content.kind === undefined) {
        throw new Error(`Not a valid component (missing kind field)`);
      }
      
      console.log(`Successfully fetched component with kind: ${content.kind}`);
      
      return content as Hypernote;
    } catch (error) {
      console.error(`Error fetching component:`, error);
      throw error;
    }
  }
}

/**
 * Parse target context from npub/nevent
 */
export interface TargetContext {
  // For kind: 0 (npub input)
  pubkey?: string;
  name?: string;
  picture?: string;
  nip05?: string;
  
  // For kind: 1 (nevent input)  
  id?: string;
  content?: string;
  created_at?: number;
  tags?: string[][];
  
  // Raw input value
  raw: string;
}

/**
 * Parse and validate target based on component kind
 */
export async function parseTarget(value: string, expectedKind: 0 | 1, client?: SNSTRClient): Promise<TargetContext> {
  console.log(`Parsing target: ${value} for kind ${expectedKind}`);
  
  try {
    if (expectedKind === 0) {
      // Component expects an npub (public key)
      // The value could be a direct npub or a reference like "note.pubkey"
      let pubkey: string;
      
      if (value.startsWith('npub')) {
        // Direct npub provided
        const decoded = nip19.decode(value);
        if (decoded.type !== 'npub') {
          throw new Error(`Expected npub, got ${decoded.type}`);
        }
        pubkey = decoded.data as string;
      } else {
        // It's a reference like "note.pubkey" or an already-resolved hex pubkey
        // Check if it looks like a hex pubkey (64 chars)
        if (/^[0-9a-f]{64}$/i.test(value)) {
          pubkey = value;
        } else {
          // It's an unresolved reference - can't fetch profile
          console.log(`Unresolved reference: ${value}, returning without profile data`);
          return {
            pubkey: value,
            raw: value
          };
        }
      }
      
      // If we have a client, fetch the profile data
      if (client) {
        const filter: Filter = {
          kinds: [0],
          authors: [pubkey],
          limit: 1
        };
        
        // Use cache for profile fetching
        const events = await queryCache.getOrFetch(filter, async (f) => {
          return await client.fetchEvents([f]);
        });
        if (events.length > 0) {
          try {
            const profile = JSON.parse(events[0].content);
            return {
              pubkey,
              name: profile.name,
              picture: profile.picture,
              nip05: profile.nip05,
              raw: value
            };
          } catch (e) {
            console.error('Failed to parse profile content:', e);
          }
        }
      }
      
      // Return just the pubkey if no profile data found
      return {
        pubkey,
        raw: value
      };
    }
    
    if (expectedKind === 1) {
      // Component expects a nevent (note/event)
      // The value could be a direct nevent or a reference
      if (value.startsWith('nevent')) {
        const decoded = nip19.decode(value);
        if (decoded.type !== 'nevent') {
          throw new Error(`Expected nevent, got ${decoded.type}`);
        }
        
        const eventData = decoded.data;
        
        // If we have a client, fetch the full event
        if (client && typeof eventData === 'object' && 'id' in eventData) {
          const filter: Filter = {
            ids: [eventData.id],
            limit: 1
          };
          
          // Use cache for event fetching
          const events = await queryCache.getOrFetch(filter, async (f) => {
            return await client.fetchEvents([f]);
          });
          if (events.length > 0) {
            const event = events[0];
            return {
              id: event.id,
              pubkey: event.pubkey,
              content: event.content,
              created_at: event.created_at,
              tags: event.tags,
              raw: value
            };
          }
        }
        
        // Return partial data from nevent
        if (typeof eventData === 'object') {
          return {
            id: eventData.id,
            pubkey: eventData.author,
            raw: value
          };
        }
      }
      
      // It's a reference - return as is
      return {
        raw: value
      };
    }
    
    throw new Error(`Invalid component kind: ${expectedKind}`);
  } catch (error) {
    console.error(`Error parsing target:`, error);
    // Return raw value on error
    return {
      raw: value
    };
  }
}