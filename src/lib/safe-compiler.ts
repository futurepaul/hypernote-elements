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
import { TokenizerError } from './tokenizer';
import type { Hypernote } from './schema';

export interface SafeCompileResult {
  success: boolean;
  data: Hypernote;
  error?: {
    message: string;
    phase?: 'tokenization' | 'parsing' | 'validation' | 'unknown';
    line?: number;
    column?: number;
    code?: string;
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
    // Always use strict validation to get proper error messages
    const result = compileHypernoteToContent(hnmd, { strictValidation: true });
    
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
    let line: number | undefined;
    let column: number | undefined;
    let code: string | undefined;
    let details = undefined;
    
    // Handle TokenizerError specifically
    if (error instanceof TokenizerError) {
      phase = 'tokenization';
      message = error.message;
      line = error.line;
      column = error.column;
      code = error.code;
    } else if (error.message) {
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
          line,
          column,
          code,
          details
        },
        isStale: true
      };
    }
    
    // No last valid state - return a minimal valid structure with error display
    const errorElements: any[] = [
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
          color: "rgb(153,27,27)",
          fontFamily: "monospace"
        }
      }
    ];

    // Add location info if available
    if (line !== undefined && column !== undefined) {
      errorElements.push({
        type: "p" as const,
        content: [`Line ${line}, Column ${column}`],
        style: {
          fontSize: "0.75rem",
          color: "rgb(113,113,122)",
          marginTop: "0.5rem"
        }
      });
    }

    // Add error code if available
    if (code) {
      errorElements.push({
        type: "p" as const,
        content: [`Error code: ${code}`],
        style: {
          fontSize: "0.75rem",
          color: "rgb(113,113,122)",
          marginTop: "0.25rem"
        }
      });
    }

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
          elements: errorElements
        }
      ]
    };
    
    return {
      success: false,
      data: fallback,
      error: {
        message,
        phase,
        line,
        column,
        code,
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