import { test, expect } from 'bun:test';
import { safeCompileHypernote, clearLastValidResult } from '../src/lib/safe-compiler';

test('should handle unclosed quote gracefully', () => {
  // Clear any previous state
  clearLastValidResult();
  
  const invalidMarkdown = `
# Test
[div class="test]
Content
[/div]`;

  const result = safeCompileHypernote(invalidMarkdown);
  
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.error?.phase).toBe('tokenization');
  expect(result.error?.message).toContain('Unclosed quote');
  expect(result.error?.line).toBeDefined();
  expect(result.error?.column).toBeDefined();
  
  // Should return fallback structure with error display
  expect(result.data.elements).toBeArray();
  expect(result.data.elements.length).toBeGreaterThan(0);
  
  // Check that error is displayed in the fallback
  const errorDiv = result.data.elements[0];
  expect(errorDiv.type).toBe('div');
  expect(errorDiv.style?.backgroundColor).toContain('rgb(254,202,202)'); // Error background
});

test('should handle unclosed tags gracefully', () => {
  clearLastValidResult();
  
  const invalidMarkdown = `
# Test
[div]
No closing tag`;

  const result = safeCompileHypernote(invalidMarkdown);
  
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.error?.phase).toBe('tokenization');
  expect(result.error?.message).toContain('Unclosed tag');
  expect(result.error?.code).toBe('UNCLOSED_TAG');
});

test('should handle mismatched tags gracefully', () => {
  clearLastValidResult();
  
  const invalidMarkdown = `
[div]
[/span]`;

  const result = safeCompileHypernote(invalidMarkdown);
  
  expect(result.success).toBe(false);
  expect(result.error).toBeDefined();
  expect(result.error?.message).toContain('Mismatched closing tag');
});

test('should preserve last valid state when errors occur', () => {
  clearLastValidResult();
  
  // First, compile valid markdown
  const validMarkdown = '# Hello\nThis is valid content';
  const validResult = safeCompileHypernote(validMarkdown);
  
  expect(validResult.success).toBe(true);
  expect(validResult.data.elements.length).toBeGreaterThan(0);
  
  // Now compile invalid markdown
  const invalidMarkdown = '[div class="unclosed';
  const invalidResult = safeCompileHypernote(invalidMarkdown);
  
  expect(invalidResult.success).toBe(false);
  expect(invalidResult.isStale).toBe(true);
  expect(invalidResult.error).toBeDefined();
  
  // Should return the last valid state
  expect(invalidResult.data).toEqual(validResult.data);
});

test('should handle form without event gracefully', () => {
  clearLastValidResult();
  
  const invalidMarkdown = '[form]\nContent\n[/form]';
  const result = safeCompileHypernote(invalidMarkdown);
  
  expect(result.success).toBe(false);
  expect(result.error?.message).toContain('Form requires an event');
});

test('should handle empty if condition gracefully', () => {
  clearLastValidResult();
  
  const invalidMarkdown = '[if ]\nContent\n[/if]';
  const result = safeCompileHypernote(invalidMarkdown);
  
  expect(result.success).toBe(false);
  expect(result.error?.message).toContain('Empty condition');
});

test('should handle missing closing bracket gracefully', () => {
  clearLastValidResult();
  
  const testCases = [
    '[div class="test"',
    '[button class="bg-blue"',
    '[span id="test"',
    '[form @submit',
    '[if $condition',
    '[each $items as $item',
    '[#component arg',
    '[/div'
  ];
  
  for (const invalidMarkdown of testCases) {
    const result = safeCompileHypernote(invalidMarkdown);
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('missing closing bracket');
    expect(result.error?.code).toBe('UNCLOSED_ELEMENT');
    
    // Should not crash - should return error display
    expect(result.data).toBeDefined();
    expect(result.data.elements).toBeArray();
  }
});

test('should compile valid markdown successfully', () => {
  clearLastValidResult();
  
  const validMarkdown = `
# Title
[div class="test"]
  [form @submit]
    [input name="message"]
    [button]Submit[/button]
  [/form]
[/div]`;

  const result = safeCompileHypernote(validMarkdown);
  
  expect(result.success).toBe(true);
  expect(result.error).toBeUndefined();
  expect(result.isStale).toBe(false);
  expect(result.data.elements).toBeArray();
});