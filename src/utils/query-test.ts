import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

const RELAY_URL = 'ws://localhost:10547';

async function testQuery() {
  console.log('Starting query test...');
  
  // Generate a test key
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  console.log(`Using test public key: ${pk}`);
  
  // Create a pool
  const pool = new SimplePool();
  
  // Define the filter
  const filter: Filter = {
    kinds: [1],
    limit: 20
  };
  
  console.log(`Querying relay ${RELAY_URL} with filter:`, filter);
  
  try {
    // Use the events method to collect all events
    const events: Event[] = [];
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
    
    console.log(`Received ${events.length} events`);
    
    // Print the first few events
    events.slice(0, 3).forEach((event, index) => {
      console.log(`Event ${index + 1}:`, {
        id: event.id,
        kind: event.kind,
        pubkey: event.pubkey.slice(0, 10) + '...',
        content: event.content.slice(0, 50) + (event.content.length > 50 ? '...' : ''),
        tags: event.tags.slice(0, 3),
        // Add more fields as needed
      });
    });
    
    // Print events with test tag
    const testEvents = events.filter(event => 
      event.tags.some(tag => tag[0] === 't' && tag[1] === 'test')
    );
    
    console.log(`Found ${testEvents.length} events with test tag`);
    
    testEvents.slice(0, 3).forEach((event, index) => {
      console.log(`Test Event ${index + 1}:`, {
        id: event.id,
        content: event.content,
        tags: event.tags
      });
    });
    
  } catch (error) {
    console.error('Error querying relay:', error);
  } finally {
    // Clean up
    pool.close([RELAY_URL]);
  }
}

testQuery().catch(console.error); 