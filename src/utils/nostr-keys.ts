import { nip19, getPublicKey } from 'nostr-tools';

export interface KeyConversionResult {
  success: boolean;
  privateKeyHex?: string;
  publicKeyHex?: string;
  npub?: string;
  nsec?: string;
  error?: string;
}

/**
 * Convert any key format to all other formats
 * Accepts: npub, nsec, hex public key, hex private key
 * Returns: all formats + validation
 */
export function convertKey(input: string): KeyConversionResult {
  const cleanInput = input.trim();
  
  try {
    // Try to decode as bech32 (npub/nsec)
    if (cleanInput.startsWith('npub') || cleanInput.startsWith('nsec')) {
      const decoded = nip19.decode(cleanInput);
      
      if (decoded.type === 'npub') {
        // Got public key in npub format
        const publicKeyHex = decoded.data as string;
        const npub = cleanInput;
        
        return {
          success: true,
          publicKeyHex,
          npub,
          error: 'Cannot derive private key from public key. Please provide nsec or private key hex.'
        };
      }
      
      if (decoded.type === 'nsec') {
        // Got private key in nsec format
        const privateKeyBytes = decoded.data as Uint8Array;
        const privateKeyHex = Array.from(privateKeyBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        const publicKeyHex = getPublicKey(privateKeyBytes);
        const nsec = cleanInput;
        const npub = nip19.npubEncode(publicKeyHex);
        
        return {
          success: true,
          privateKeyHex,
          publicKeyHex,
          npub,
          nsec
        };
      }
    }
    
    // Try as hex
    if (/^[0-9a-f]{64}$/i.test(cleanInput)) {
      const hexKey = cleanInput.toLowerCase();
      
      // Could be either private or public key hex
      // Try as private key first
      try {
        const privateKeyBytes = new Uint8Array(
          hexKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
        );
        const publicKeyHex = getPublicKey(privateKeyBytes);
        const npub = nip19.npubEncode(publicKeyHex);
        const nsec = nip19.nsecEncode(privateKeyBytes);
        
        return {
          success: true,
          privateKeyHex: hexKey,
          publicKeyHex,
          npub,
          nsec
        };
      } catch {
        // If getPublicKey fails, treat as public key hex
        const npub = nip19.npubEncode(hexKey);
        
        return {
          success: true,
          publicKeyHex: hexKey,
          npub,
          error: 'Hex appears to be public key. Please provide private key (nsec or private hex) to use the app.'
        };
      }
    }
    
    return {
      success: false,
      error: 'Invalid format. Please provide: npub, nsec, or 64-character hex key.'
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Conversion error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Simple validation functions
 */
export function isValidNpub(input: string): boolean {
  try {
    const decoded = nip19.decode(input.trim());
    return decoded.type === 'npub';
  } catch {
    return false;
  }
}

export function isValidNsec(input: string): boolean {
  try {
    const decoded = nip19.decode(input.trim());
    return decoded.type === 'nsec';
  } catch {
    return false;
  }
}

export function isValidHex(input: string): boolean {
  return /^[0-9a-f]{64}$/i.test(input.trim());
}

/**
 * Get key type from input
 */
export function getKeyType(input: string): 'npub' | 'nsec' | 'hex' | 'invalid' {
  const clean = input.trim();
  
  if (clean.startsWith('npub')) return 'npub';
  if (clean.startsWith('nsec')) return 'nsec'; 
  if (isValidHex(clean)) return 'hex';
  return 'invalid';
}