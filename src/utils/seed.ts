import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { RelayHandler } from '../lib/relayHandler';

const RELAY_URL = 'ws://localhost:10547';

// Generate a test key pair
function generateTestKeyPair() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return { secretKey: sk, publicKey: pk };
}

// Seed test notes
async function seedTestNotes(count: number = 10) {
  // Generate a test keypair for seeding
  const { secretKey, publicKey } = generateTestKeyPair();
  console.log(`Using test public key: ${publicKey}`);

  // Create a logger function
  const logger = (message: string) => console.log(`[SEED] ${message}`);

  // Initialize the relay handler with the test key
  const relayHandler = new RelayHandler([RELAY_URL], secretKey, logger);

  // Explicitly connect to relay
  try {
    await relayHandler.connect();
    console.log('Connected to relay for seeding');
  } catch (error) {
    console.error('Failed to connect to relay:', error);
    throw error;
  }

  console.log(`Publishing ${count} test notes...`);
  const publishedIds = [];

  // Publish test notes
  for (let i = 1; i <= count; i++) {
    try {
      const content = `Test note ${i} from seed utility`;
      const tags = [
        ['t', 'test'],
        ['t', 'seed'],
        ['i', `${i}`]
      ];

      const result = await relayHandler.publishEvent(1, content, tags);
      publishedIds.push(result.eventId);
      console.log(`Published test note ${i} with ID: ${result.eventId} to ${result.successCount} relays`);

      // Small delay between publications
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error publishing test note ${i}:`, error);
    }
  }

  console.log(`Finished publishing ${publishedIds.length} of ${count} test notes`);
  
  // Verify the notes were published by fetching them
  try {
    console.log('\nVerifying published notes...');
    const filter = {
      kinds: [1],
      authors: [publicKey],
      limit: count
    };
    
    const events = await relayHandler.subscribe([filter], () => {});
    if (Array.isArray(events)) {
      console.log(`Successfully verified ${events.length} notes`);
      
      // Display the first few notes
      events.slice(0, 3).forEach(event => {
        console.log(`- Note: ${event.content} (${event.id})`);
      });
      
      if (events.length > 3) {
        console.log(`... and ${events.length - 3} more`);
      }
    } else {
      console.log(`Failed to verify notes`);
    }
  } catch (error) {
    console.error('Error verifying notes:', error);
  }

  // Cleanup
  relayHandler.cleanup();
}

// Main function
async function main() {
  console.log('Starting seed utility...');
  console.log('Assuming NAK relay is already running at ' + RELAY_URL);

  // Seed test notes
  await seedTestNotes(10);
  
  console.log('Seed utility completed successfully!');
  process.exit(0);
}

// Run the main function
main().catch(error => {
  console.error('Uncaught error in seed utility:', error);
  process.exit(1);
}); 