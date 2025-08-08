import type { Hypernote } from './schema';
import { HYPERNOTE_KIND, HYPERNOTE_ELEMENT_KIND } from './schema';
import { nip19 } from 'nostr-tools';
import type { SNSTRClient } from './snstr/client';

export interface PublishResult {
  eventId: string;
  naddr?: string;
  nevent?: string;
  success: boolean;
  error?: string;
}

/**
 * Publish a Hypernote (component or regular) to Nostr
 * Automatically detects if it's a component based on the 'kind' field
 */
export async function publishHypernote(
  name: string,
  hypernote: Hypernote,
  client: SNSTRClient,
  metadata?: { title?: string; description?: string }
): Promise<PublishResult> {
  try {
    // Check if window.nostr is available (NIP-07)
    if (typeof window === 'undefined' || !window.nostr) {
      throw new Error("NIP-07 extension not found. Please install a Nostr signer extension.");
    }

    // Determine document type (both use the same event kind now)
    const documentType = hypernote.type || (hypernote.kind !== undefined ? 'element' : 'hypernote');
    const isComponent = documentType === 'element' || hypernote.kind !== undefined;
    const eventKind = HYPERNOTE_KIND; // Always 32616 for all hypernotes
    
    // Build tags
    const tags: string[][] = [
      ["d", name], // Replaceable identifier
      ["hypernote", "1.1.0"],
      ["t", "hypernote"]
    ];
    
    // Add type tag to differentiate applications from elements
    if (isComponent) {
      tags.push(["hypernote-type", "element"]);
      tags.push(["hypernote-component-kind", String(hypernote.kind)]);
      tags.push(["t", "hypernote-element"]);
    } else {
      tags.push(["hypernote-type", "application"]);
      tags.push(["t", "hypernote-app"]);
    }
    
    if (metadata?.title) {
      tags.push(["title", metadata.title]);
    }
    
    if (metadata?.description) {
      tags.push(["description", metadata.description]);
    }
    
    // Create the unsigned event
    const unsignedEvent = {
      kind: eventKind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: JSON.stringify(hypernote),
      pubkey: '' // Will be filled by NIP-07
    };
    
    // Sign with NIP-07
    const signedEvent = await window.nostr.signEvent(unsignedEvent);
    
    // Publish to relays
    const publishResult = await client.publishEvent(signedEvent);
    
    if (!publishResult || publishResult.length === 0) {
      throw new Error("Failed to publish to any relay");
    }
    
    // Generate naddr for replaceable event
    const naddrData = {
      identifier: name,
      pubkey: signedEvent.pubkey,
      kind: eventKind,
      relays: client.getConnectedRelays()
    };
    
    const naddr = nip19.naddrEncode(naddrData);
    
    // Also generate nevent for the specific event
    const neventData = {
      id: signedEvent.id!,
      relays: client.getConnectedRelays(),
      author: signedEvent.pubkey
    };
    
    const nevent = nip19.neventEncode(neventData);
    
    console.log(`Published ${isComponent ? 'component' : 'hypernote'} "${name}"`);
    console.log(`Event ID: ${signedEvent.id}`);
    console.log(`NADDR: ${naddr}`);
    console.log(`NEVENT: ${nevent}`);
    
    if (isComponent) {
      console.log(`Component expects: ${hypernote.kind === 0 ? 'npub' : 'nevent'} input`);
    }
    
    return {
      eventId: signedEvent.id!,
      naddr,
      nevent,
      success: true
    };
  } catch (error) {
    console.error('Failed to publish:', error);
    return {
      eventId: '',
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Extend window type for NIP-07
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: any): Promise<any>;
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
  }
}