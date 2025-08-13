# Fix Tokenizer Plan

## Current Problems

1. **Infinite loop in parseTokens** - When we have nested structures with missing brackets, parseContainer gets stuck
2. **Valid code now fails** - The refactoring broke valid examples like basic.md 
3. **checkClosingBracket is too aggressive** - It checks `content[pos] !== ']'` which might be wrong
4. **parseContainer safety check is wrong** - We added a check that throws "missing closing tag" but it triggers on valid code

## Root Cause Analysis

The main issue is that we tried to fix two different problems at once:
1. Missing closing brackets `[div class="test"` (tokenizer issue)
2. Missing closing tags `[div]content` without `[/div]` (parser issue)

These are DIFFERENT problems that need different solutions.

## The Fix Plan

### Phase 1: Revert Breaking Changes
- Remove the aggressive check in parseContainer that throws "Unclosed form - missing closing tag"
- This check is wrong because it triggers when we properly find a closing tag

### Phase 2: Fix Tokenizer Bracket Handling
- When tokenizing `[element ...`, we need to find `]` on the SAME LINE
- If we hit a newline before finding `]`, we should throw an error
- This prevents the infinite loop because we never create invalid tokens

### Phase 3: Fix Parser Safety
- parseContainer should track if it found its closing tag properly
- If it reaches EOF without finding the closing tag, it should NOT throw (that's the tokenizer's job)
- Instead, it should just return what it has (partial parse)

### Phase 4: Simplify Error Handling
- Tokenizer errors = syntax errors (missing brackets, unclosed quotes)
- Parser errors = structural errors (mismatched tags) 
- Keep them separate!

## Implementation Strategy

### Step 1: Fix checkClosingBracket
```typescript
function checkClosingBracket(...) {
  // Only check if we ran out of content, not if content[pos] !== ']'
  if (pos >= content.length) {
    throw new TokenizerError(...);
  }
  // Don't check content[pos] here - let the caller handle that
}
```

### Step 2: Fix parseContainer 
```typescript
// Remove the bad check we added:
// if (currentIndex >= tokens.length || tokens[currentIndex].type === TokenType.EOF) {
//   throw new Error(`Unclosed ${containerType} - missing closing tag`);
// }

// Instead, just return what we have
```

### Step 3: Add Line-Based Bracket Check
```typescript
// When looking for ], check if we hit newline first
while (pos < content.length && content[pos] !== ']' && content[pos] !== '\n') {
  // ... parse attributes
}

if (pos >= content.length || content[pos] === '\n') {
  // Missing bracket on this line
  throw new TokenizerError('Element not closed on same line');
}
```

## Testing Strategy

1. **Test missing brackets**: `[div class="test"` should fail in tokenizer
2. **Test missing closing tags**: `[div]text` should fail in validation (not tokenizer)
3. **Test valid nested structures**: Chess example should work
4. **Test all examples**: basic.md, chess.md, etc should all compile

## Code Reduction Strategy

After fixing the core issues, we should:

1. **Create a generic element handler** that handles all `[element attrs]` patterns
2. **Create a generic container handler** that handles all `[element]...[/element]` patterns  
3. **Reduce 1700 lines to ~800 lines** by eliminating duplication

## Success Criteria

- [ ] No infinite loops on any input
- [ ] All valid examples compile successfully
- [ ] Missing brackets fail fast with clear errors
- [ ] Missing closing tags are caught by validation
- [ ] Tokenizer is under 1000 lines of code