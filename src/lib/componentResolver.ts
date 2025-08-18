import { nip19 } from 'nostr-tools';
import type { SNSTRClient } from './snstr/client';
import type { Filter } from './snstr/client';
import { queryCache } from './queryCache';
import { getTargetBatcher } from './TargetBatcher';

/**
 * Handles parsing of component arguments (npub/nevent targets)
 */
export class ComponentResolver {
  private client: SNSTRClient | null = null;
  
  constructor(client?: SNSTRClient) {
    this.client = client || null;
  }
  
  setClient(client: SNSTRClient) {
    this.client = client;
  }

  // Component fetching methods removed - components are now queries
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
      
      // Try to use the batcher first for profile fetching
      const batcher = getTargetBatcher(client);
      if (batcher) {
        console.log(`[parseTarget] Using batcher for profile: "${pubkey.substring(0, 8)}..."`);
        try {
          const target = await batcher.getTarget(pubkey);
          return { ...target, raw: value };
        } catch (error) {
          console.error(`[parseTarget] Batcher failed for ${pubkey}:`, error);
          // Fall through to direct fetch
        }
      }
      
      // Fallback: If we have a client but no batcher, fetch directly
      if (client && !batcher) {
        const filter: Filter = {
          kinds: [0],
          authors: [pubkey],
          limit: 1
        };
        
        console.log(`[parseTarget] Direct fetch for profile: "${pubkey}" (length: ${pubkey.length})`);
        
        // Use cache for profile fetching
        const events = await queryCache.getOrFetch(filter, async (f) => {
          console.log(`[parseTarget] Sending filter to relay:`, JSON.stringify(f));
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