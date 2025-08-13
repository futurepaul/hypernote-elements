/**
 * Safe compiler for live editing
 * 
 * This compiler is designed for use in live editing environments where the
 * user may temporarily create invalid syntax while typing. It will:
 * 1. Try to compile the input
 * 2. Return the last valid state if compilation fails
 * 3. Provide error information without crashing
 */

import { compileHypernoteToContent } from './compiler';
import type { Hypernote } from './schema';

export interface SafeCompileResult {
  success: boolean;
  data: Hypernote;
  error?: {
    message: string;
    phase?: 'tokenization' | 'parsing' | 'validation' | 'unknown';
    details?: any;
  };
  isStale?: boolean; // True if returning cached last valid state
}

// Cache for the last valid compilation result
let lastValidResult: Hypernote | null = null;

/**
 * Safely compile Hypernote markdown with fallback to last valid state
 * 
 * @param hnmd The Hypernote markdown to compile  
 * @param returnLastValid Whether to return last valid state on error (default: true)
 * @returns A safe result with either the compiled data or last valid state
 */
export function safeCompileHypernote(
  hnmd: string,
  returnLastValid: boolean = true
): SafeCompileResult {
  try {
    // Try to compile (validation is already disabled in compiler.ts)
    const result = compileHypernoteToContent(hnmd);
    
    // Success! Update the cached valid result
    lastValidResult = result;
    
    return {
      success: true,
      data: result,
      isStale: false
    };
    
  } catch (error: any) {
    // Compilation failed - determine the phase
    let phase: SafeCompileResult['error']['phase'] = 'unknown';
    let message = 'Compilation failed';
    let details = undefined;
    
    if (error.message) {
      message = error.message;
      
      // Try to determine which phase failed
      if (message.includes('token') || message.includes('Token')) {
        phase = 'tokenization';
      } else if (message.includes('parse') || message.includes('Parse')) {
        phase = 'parsing';
      } else if (message.includes('validat') || message.includes('Validat')) {
        phase = 'validation';
      }
      
      // Extract useful details if available
      if (error.stack) {
        const lines = error.stack.split('\n');
        const relevantLine = lines.find((line: string) => 
          line.includes('tokenizer') || 
          line.includes('parser') || 
          line.includes('compiler')
        );
        if (relevantLine) {
          details = relevantLine.trim();
        }
      }
    }
    
    // Return last valid state if available and requested
    if (returnLastValid && lastValidResult) {
      return {
        success: false,
        data: lastValidResult,
        error: {
          message,
          phase,
          details
        },
        isStale: true
      };
    }
    
    // No last valid state - return a minimal valid structure
    const fallback: Hypernote = {
      version: "1.1.0",
      elements: [
        {
          type: "div" as const,
          style: {
            padding: "1rem",
            backgroundColor: "rgb(254,202,202)",
            borderRadius: "0.25rem",
            borderWidth: "1px",
            borderColor: "rgb(239,68,68)"
          },
          elements: [
            {
              type: "p" as const,
              content: ["⚠️ Syntax Error"],
              style: {
                fontWeight: 700,
                color: "rgb(127,29,29)",
                marginBottom: "0.5rem"
              }
            },
            {
              type: "p" as const,
              content: [message],
              style: {
                fontSize: "0.875rem",
                color: "rgb(153,27,27)"
              }
            }
          ]
        }
      ]
    };
    
    return {
      success: false,
      data: fallback,
      error: {
        message,
        phase,
        details
      },
      isStale: false
    };
  }
}

/**
 * Clear the cached last valid result
 */
export function clearLastValidResult(): void {
  lastValidResult = null;
}

/**
 * Get the current cached last valid result (if any)
 */
export function getLastValidResult(): Hypernote | null {
  return lastValidResult;
}

/**
 * Set a specific result as the last valid (useful for initialization)
 */
export function setLastValidResult(result: Hypernote): void {
  lastValidResult = result;
}