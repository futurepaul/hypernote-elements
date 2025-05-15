import type { Filter, Event } from 'nostr-tools';
import { RelayHandler } from './relayHandler';

/**
 * Fetch all Nostr events matching the given filter using the relayHandler.
 * Returns a Promise of Event[].
 */
export async function fetchNostrEvents(relayHandler: RelayHandler, filter: Filter): Promise<Event[]> {
  // relayHandler.subscribe returns Event[] if no callback is provided
  const events = await relayHandler.subscribe([filter]);
  // Defensive: ensure it's an array
  return Array.isArray(events) ? events : [];
} 