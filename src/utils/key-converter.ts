import { convertKey, getKeyType } from './nostr-keys';

// Add to window for browser console access
declare global {
  interface Window {
    convertKey: (input: string) => any;
    getKeyType: (input: string) => string;
    testAnyKey: (input: string) => void;
  }
}

// Main conversion function - handles any key format
window.convertKey = convertKey;
window.getKeyType = getKeyType;

// Test any key format and show all conversions
window.testAnyKey = function(input: string): void {
  console.log('🔍 Testing key:', input.slice(0, 20) + '...');
  console.log('Detected type:', getKeyType(input));
  
  const result = convertKey(input);
  
  if (result.success) {
    console.log('✅ Conversion successful!');
    if (result.privateKeyHex) console.log('Private key (hex):', result.privateKeyHex);
    if (result.publicKeyHex) console.log('Public key (hex):', result.publicKeyHex);
    if (result.npub) console.log('npub:', result.npub);
    if (result.nsec) console.log('nsec:', result.nsec);
  } else {
    console.log('❌ Conversion failed:', result.error);
  }
  
  if (result.error && result.success) {
    console.log('⚠️ Note:', result.error);
  }
};

console.log('🔧 Nostr key utilities loaded:');
console.log('   convertKey("any-key-format") - Convert between all formats');
console.log('   getKeyType("key") - Detect key type (npub/nsec/hex/invalid)');
console.log('   testAnyKey("key") - Test and show all conversions');
console.log('\n💡 Supports: npub, nsec, hex public key, hex private key');