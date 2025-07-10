import { test, expect, beforeAll, afterAll } from "bun:test";
import { fetchNostrEvents } from "../src/lib/nostrFetch";
import { RelayHandler } from "../src/lib/relayHandler";
import { generateSecretKey, getPublicKey, finalizeEvent, getEventHash } from "nostr-tools/pure";
import type { Event } from "nostr-tools";

const RELAY_URL = 'ws://localhost:10547';

let relayHandler: RelayHandler;
let testSecretKey: Uint8Array;
let testPublicKey: string;

// Setup before tests
beforeAll(async () => {
  // Generate a test key pair
  testSecretKey = generateSecretKey();
  testPublicKey = getPublicKey(testSecretKey);
  
  console.log(`Testing pipe reverse with relay: ${RELAY_URL}`);
  console.log(`Test pubkey: ${testPublicKey}`);
  
  // Create relay handler with required parameters
  relayHandler = new RelayHandler([RELAY_URL], testSecretKey, console.log);
  
  // Explicitly connect to relay
  try {
    console.log('🔌 Connecting to relay...');
    await relayHandler.connect();
    console.log('✅ Relay connected, seeding test events...');
    
    // Seed some test events with explicitly distinct timestamps
    const baseTime = Math.floor(Date.now() / 1000) - 1000; // Start from 1000 seconds ago
    const testEvents = [
      {
        kind: 1,
        pubkey: testPublicKey,
        created_at: baseTime,     // Oldest (first chronologically)
        content: "Oldest post (first chronologically)",
        tags: [["t", "pipe-test-distinct"]]
      },
      {
        kind: 1,
        pubkey: testPublicKey,
        created_at: baseTime + 300, // Middle 
        content: "Middle post",
        tags: [["t", "pipe-test-distinct"]]
      },
      {
        kind: 1,
        pubkey: testPublicKey,
        created_at: baseTime + 600, // Newest (last chronologically)
        content: "Newest post (last chronologically)", 
        tags: [["t", "pipe-test-distinct"]]
      }
    ];
    
    // Publish the test events using finalizeEvent to preserve our timestamps
    for (const eventTemplate of testEvents) {
      const signedEvent = finalizeEvent(eventTemplate, testSecretKey);
      
      // Use the pool directly to preserve our custom created_at
      const publishResults = relayHandler['pool'].publish([RELAY_URL], signedEvent);
      
      // Wait for at least one relay to accept it
      const results = await Promise.allSettled(publishResults);
      const hasSuccess = results.some(r => r.status === 'fulfilled');
      
      if (!hasSuccess) {
        throw new Error("Failed to publish test event to any relay");
      }
    }
    
    console.log('✅ Test events published successfully');
    
    // Wait a bit for events to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));
    
  } catch (error) {
    console.warn('⚠️  Warning: Local relay not available at', RELAY_URL);
    console.warn('⚠️  Connection error:', error.message);
    console.warn('⚠️  Make sure to run `nak serve` to start the test relay');
    console.warn('⚠️  Tests will be skipped if relay is not available');
  }
});

// Cleanup after tests
afterAll(() => {
  if (relayHandler) {
    relayHandler.cleanup();
  }
});

// Helper to check if relay is available
async function isRelayAvailable(): Promise<boolean> {
  try {
    // Check if we have any connected relays
    const connectedRelays = relayHandler.getConnectedRelays();
    return connectedRelays.length > 0;
  } catch {
    return false;
  }
}

test("should execute reverse pipe operation correctly with real relay", async () => {
  if (!(await isRelayAvailable())) {
    console.warn('⚠️  Skipping test: relay not available');
    return;
  }
  
  // Query without pipe to see natural order
  const baseQueryConfig = {
    kinds: [1],
    authors: [testPublicKey],
    "#t": ["pipe-test-distinct"],
    limit: 10
  };
  
  const baseResult = await fetchNostrEvents(relayHandler, baseQueryConfig);
  console.log('📊 Base query result (natural order):');
  baseResult.forEach((event, i) => {
    console.log(`  ${i}: ${event.content} (created_at: ${event.created_at})`);
  });
  
  // Query with reverse pipe
  const reverseQueryConfig = {
    ...baseQueryConfig,
    pipe: [
      {
        operation: "reverse"
      }
    ]
  };
  
  const reverseResult = await fetchNostrEvents(relayHandler, reverseQueryConfig);
  console.log('🔄 Reverse pipe result:');
  reverseResult.forEach((event, i) => {
    console.log(`  ${i}: ${event.content} (created_at: ${event.created_at})`);
  });
  
  // Verify we have events
  expect(baseResult.length).toBeGreaterThan(0);
  expect(reverseResult.length).toBe(baseResult.length);
  
  // Verify reverse actually reverses the order
  if (baseResult.length > 1) {
    expect(reverseResult[0].id).toBe(baseResult[baseResult.length - 1].id);
    expect(reverseResult[reverseResult.length - 1].id).toBe(baseResult[0].id);
  }
});

test("should handle query without pipe correctly with real relay", async () => {
  if (!(await isRelayAvailable())) {
    console.warn('⚠️  Skipping test: relay not available');
    return;
  }
  
  // Query without pipe
  const queryConfig = {
    kinds: [1],
    authors: [testPublicKey],
    "#t": ["pipe-test-distinct"],
    limit: 10
  };
  
  const result = await fetchNostrEvents(relayHandler, queryConfig);
  
  // Should get events in whatever order the relay returns them
  expect(Array.isArray(result)).toBe(true);
  console.log(`📋 Query without pipe returned ${result.length} events`);
});

test("should understand relay's natural chronological ordering", async () => {
  if (!(await isRelayAvailable())) {
    console.warn('⚠️  Skipping test: relay not available');
    return;
  }
  
  // Get events and inspect their timestamps
  const queryConfig = {
    kinds: [1],
    authors: [testPublicKey],
    "#t": ["pipe-test-distinct"],
    limit: 10
  };
  
  const result = await fetchNostrEvents(relayHandler, queryConfig);
  
  if (result.length >= 2) {
    console.log('🕐 Analyzing relay\'s natural ordering:');
    console.log(`  First event: created_at ${result[0].created_at} (${result[0].content})`);
    console.log(`  Last event: created_at ${result[result.length-1].created_at} (${result[result.length-1].content})`);
    
    // Check if relay returns newest-first (reverse chronological) or oldest-first (chronological)
    const isNewestFirst = result[0].created_at > result[result.length-1].created_at;
    console.log(`  Relay returns: ${isNewestFirst ? 'newest-first (reverse-chronological)' : 'oldest-first (chronological)'}`);
    
    // This helps us understand what "reverse" should do
    if (isNewestFirst) {
      console.log('  → So "reverse" operation should give us oldest-first');
    } else {
      console.log('  → So "reverse" operation should give us newest-first');
    }
  }
});