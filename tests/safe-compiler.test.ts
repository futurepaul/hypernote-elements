import { describe, test, expect } from "bun:test";
import { 
  safeCompileHypernote, 
  clearLastValidResult,
  setLastValidResult,
  getLastValidResult 
} from "../src/lib/safe-compiler";

describe("Safe Compiler", () => {
  test("compiles valid markdown successfully", () => {
    const result = safeCompileHypernote("# Hello World");
    
    expect(result.success).toBe(true);
    expect(result.isStale).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.data.elements).toHaveLength(1);
    expect(result.data.elements[0].type).toBe("h1");
  });

  test("returns last valid state when compilation fails", () => {
    // First compile something valid
    const validResult = safeCompileHypernote("# Valid Content");
    expect(validResult.success).toBe(true);
    
    // Now try to compile something that would fail
    // Use a tokenizer error - unclosed bracket
    const invalidResult = safeCompileHypernote(`---
---
[div
# Content`);
    
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.isStale).toBe(true); // Using cached result
    expect(invalidResult.error).toBeDefined();
    
    // Should return the last valid data
    expect(invalidResult.data.elements).toHaveLength(1);
    expect(invalidResult.data.elements[0].type).toBe("h1");
    expect(invalidResult.data.elements[0].content).toEqual(["Valid Content"]);
  });

  test("returns error structure when no last valid state", () => {
    clearLastValidResult();
    
    // Try to compile with tokenizer error and no cached result
    const result = safeCompileHypernote(`[div unclosed bracket`);
    
    expect(result.success).toBe(false);
    expect(result.isStale).toBe(false); // No cached result
    expect(result.error).toBeDefined();
    
    // Should return fallback error structure
    expect(result.data.elements).toHaveLength(1);
    expect(result.data.elements[0].type).toBe("div");
    const errorDiv = result.data.elements[0];
    expect(errorDiv.style?.backgroundColor).toContain("254,202,202"); // Light red
  });

  test("handles mid-edit states gracefully", () => {
    // Simulate user typing a div wrapper
    const states = [
      "# My Content",           // Valid
      "[div\n# My Content",      // Invalid - unclosed
      "[div]\n# My Content",     // Invalid - no closing
      "[div]\n# My Content\n[/div]" // Valid again
    ];
    
    let lastValid: any = null;
    
    states.forEach((state, index) => {
      const result = safeCompileHypernote(state);
      
      if (result.success) {
        lastValid = result.data;
        expect(result.isStale).toBe(false);
      } else {
        // Should get the last valid state
        if (lastValid) {
          expect(result.isStale).toBe(true);
        }
      }
    });
  });

  test("can disable returning last valid state", () => {
    // Set up a valid state
    safeCompileHypernote("# Valid");
    
    // Compile invalid without fallback (unclosed element)
    const result = safeCompileHypernote(`[div class="test"
Unclosed div element`, false);
    
    expect(result.success).toBe(false);
    expect(result.isStale).toBe(false);
    expect(result.data.elements[0].type).toBe("div"); // Error div, not cached h1
  });

  test("cache management functions work", () => {
    clearLastValidResult();
    expect(getLastValidResult()).toBeNull();
    
    const testData = {
      version: "1.1.0" as const,
      elements: []
    };
    
    setLastValidResult(testData);
    expect(getLastValidResult()).toEqual(testData);
    
    clearLastValidResult();
    expect(getLastValidResult()).toBeNull();
  });
});