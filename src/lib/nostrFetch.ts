// Using our SNSTR types instead of nostr-tools
import type { NostrEvent } from './snstr/nip07';
import type { Filter } from './snstr/client';

// Type alias for compatibility
type Event = NostrEvent;
type RelayHandler = any; // Compatibility type

/**
 * Execute a pipe transformation step on the given data
 */
function executePipeStep(data: Event[], step: any): Event[] {
  if (step.operation === 'reverse') {
    // Reverse the array (creates a new array, doesn't mutate)
    return [...data].reverse();
  }
  
  // For unsupported operations, return data unchanged and log warning
  console.warn(`Unsupported pipe operation:`, step);
  return data;
}

/**
 * Fetch and process Nostr events matching the given query configuration.
 * Supports both simple Nostr filters and queries with pipe transformations.
 * Returns a Promise of Event[].
 */
export async function fetchNostrEvents(relayHandler: RelayHandler, queryConfig: any): Promise<Event[]> {
  // Extract the base Nostr filter (everything except 'pipe')
  const { pipe, ...nostrFilter } = queryConfig;
  
  // Fetch events using the base Nostr filter
  const events = await relayHandler.subscribe([nostrFilter as Filter]);
  let result: Event[] = [];
  
  if (Array.isArray(events)) {
    result = events;
  } else {
    // If subscribe returns a string (subscription ID), it means the subscription is ongoing
    // but we need to handle this case differently for one-time queries
    console.warn('Subscribe returned subscription ID instead of events:', events);
    result = [];
  }
  
  // Apply pipe transformations if present
  if (pipe && Array.isArray(pipe)) {
    for (const step of pipe) {
      result = executePipeStep(result, step);
    }
  }
  
  return result;
} 