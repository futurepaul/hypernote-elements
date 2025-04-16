import { test, expect, beforeAll, afterAll } from "bun:test";
import { SimplePool } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Event, Filter } from "nostr-tools";

const RELAY_URL = 'ws://localhost:10547';

// Create test environment variables
let pool: SimplePool;
let testPublicKey: string;

// Setup before tests
beforeAll(() => {
  // Generate a test key pair for querying
  const secretKey = generateSecretKey();
  testPublicKey = getPublicKey(secretKey);
  
  // Create a pool
  pool = new SimplePool();
  
  // Let's log some info
  console.log(`Test using relay: ${RELAY_URL}`);
  console.log(`Test pubkey: ${testPublicKey}`);
});

// Cleanup after tests
afterAll(() => {
  // Clean up the pool
  pool.close([RELAY_URL]);
});

// Helper function to query events
async function queryEvents(filter: Filter): Promise<Event[]> {
  const events: Event[] = [];
  
  console.log(`Querying with filter: ${JSON.stringify(filter)}`);
  
  await new Promise<void>((resolve) => {
    const sub = pool.subscribeMany(
      [RELAY_URL], 
      [filter],
      {
        onevent: (event) => {
          console.log(`Received event: ${event.id}`);
          events.push(event);
        },
        oneose: () => {
          console.log('End of stored events');
          resolve();
        }
      }
    );
    
    // Set a timeout in case EOSE never comes
    setTimeout(() => {
      console.log('Timeout reached');
      resolve();
    }, 5000);
  });
  
  return events;
}

test("should be able to query test notes with tag 'test'", async () => {
  // Define the filter to find test notes
  const filter = {
    kinds: [1],
    '#t': ['test'],  // Look for notes with the test tag
    limit: 20
  };
  
  // Query the relay for test notes
  const events = await queryEvents(filter);
  
  // Verify we got some events
  expect(Array.isArray(events)).toBe(true);
  
  // We should have at least a few events
  expect(events.length).toBeGreaterThan(0);
  
  // Log what we found
  console.log(`Found ${events.length} test notes`);
  
  // Check that the events have the right structure
  for (const event of events.slice(0, 3)) {
    expect(event.kind).toBe(1);
    expect(event.content).toInclude("Test note");
    
    // Check that each event has our test tags
    const testTags = event.tags.filter(tag => tag[0] === 't' && tag[1] === 'test');
    expect(testTags.length).toBeGreaterThan(0);
    
    const seedTags = event.tags.filter(tag => tag[0] === 't' && tag[1] === 'seed');
    expect(seedTags.length).toBeGreaterThan(0);
    
    // Log the event for debugging
    console.log(`- Note: ${event.content} (${event.id})`);
  }
});

test("should be able to query test notes with a specific index", async () => {
  // Define the filter to find specific test note (e.g., with index 1)
  const filter = {
    kinds: [1],
    '#i': ['1'],  // Look for notes with index 1
    limit: 5
  };
  
  // Query the relay for test notes
  const events = await queryEvents(filter);
  
  // Verify we got some events
  expect(Array.isArray(events)).toBe(true);
  
  // We should have at least one event
  expect(events.length).toBeGreaterThan(0);
  
  // Log what we found
  console.log(`Found ${events.length} test notes with index 1`);
  
  // Check that we found test note 1
  const testNote1 = events.find(event => event.content.includes("Test note 1"));
  expect(testNote1).toBeDefined();
  
  if (testNote1) {
    console.log(`Found test note 1: ${testNote1.content}`);
    
    // Check that it has the right structure
    expect(testNote1.kind).toBe(1);
    expect(testNote1.content).toInclude("Test note 1");
    
    // Verify the index tag exists
    const indexTag = testNote1.tags.find(tag => tag[0] === 'i' && tag[1] === '1');
    expect(indexTag).toBeDefined();
  }
}); 