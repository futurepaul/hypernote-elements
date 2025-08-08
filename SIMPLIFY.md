# SIMPLIFY.md - Hypernote Architecture Simplification Plan

## Executive Summary

After reviewing the current implementation against the original vision in README.md and OUTPUT.md, I've identified several opportunities to unify concepts and reduce special casing. The goal is to make Hypernote more composable and extensible without losing functionality.

## Current Pain Points

### 1. Variable Resolution Complexity
- Multiple ways to access data: `{$count.content}`, `{user.pubkey}`, `{response.result}`
- Special handling for Kind 0 events (profile JSON parsing)
- Inconsistent array handling (sometimes auto-selects first item)
- Hard-coded response variable handling for tool calls

### 2. Tool Call Special Casing (src/renderer.tsx:180-398)
- ContextVM tool calls have extensive hard-coded logic
- Response handling is baked into the renderer
- `target` field only works for tool calls, not general event chaining
- MCP response format extraction is hard-coded

### 3. Tokenizer Repetition (src/lib/tokenizer.ts:305-441)
- Nearly identical parsing logic for div, button, span, form elements
- Each element type has its own token types (DIV_START/DIV_END, etc.)
- Could be unified into generic ELEMENT_START/ELEMENT_END

### 4. Pipe Operations Underutilized
- We have a powerful pipe system with jq-like operations
- But we're not using it consistently (e.g., `{$count.content}` vs pipes)
- Could make pipes the universal data transformation mechanism

## Proposed Simplifications

### 1. Universal Pipe-Based Data Access

Instead of special-casing variable access patterns, make everything go through pipes:

```yaml
# Current (multiple patterns):
"$count":
  kinds: [30078]
  authors: [user.pubkey]
  limit: 1
# Access: {$count.content}

# Proposed (unified with pipes):
"$count":
  kinds: [30078]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - first           # Take first result (replaces implicit [0])
    - field: content  # Extract field (replaces .content)
    - default: "0"    # Provide default (replaces || operator)
```

**Benefits:**
- Single, consistent data access pattern
- Explicit transformations (no hidden array[0] access)
- Composable operations
- Default values without new syntax

### 2. Declarative Event Chaining

Replace hard-coded tool call handling with declarative event chains:

```yaml
# Current (hard-coded tool call):
"@increment":
  kind: 25910
  tool_call: true  # Special flag
  provider: "npub1..."
  tool_name: "addone"
  arguments:
    a: "{$count.content}"
  target: "@update_count"  # Only works for tool calls

# Proposed (generic event chaining):
"@increment":
  kind: 25910
  content:
    template: "json-rpc"  # Template type
    method: "tools/call"
    params:
      name: "addone"
      arguments:
        a: "{$count | first | field:content}"
  tags:
    - ["p", "{provider}"]
  
  # Generic response handling (not just for tool calls)
  on_response:
    filter:
      kinds: [25910]
      authors: "{provider}"
      "#e": "{event.id}"
    timeout: 30000
    
    # Chain to another event
    trigger: "@update_count"
    
    # Map response data to the triggered event
    extract:
      - from: "content | json | .result"
        to: "response.result"
```

**Benefits:**
- Any event can chain to another event
- Response handling is declarative, not hard-coded
- Works for any async pattern, not just ContextVM
- Content templates (json-rpc, plain, etc.) for common formats

### 3. Unified Element Syntax in Tokenizer

```typescript
// Current: Separate token types for each element
enum TokenType {
  DIV_START, DIV_END,
  BUTTON_START, BUTTON_END,
  SPAN_START, SPAN_END,
  // ... etc
}

// Proposed: Generic element tokens
enum TokenType {
  ELEMENT_START,  // With element.type property
  ELEMENT_END,    // With element.type property
  // ... other tokens
}
```

**Benefits:**
- 80% less code in tokenizer
- Easier to add new element types
- Single parsing function for all container elements

### 4. Pipe Operations Everywhere

Make pipes the universal transformation mechanism:

```yaml
# Variable access with pipes
"{$posts | first | field:content}"
"{$profile | field:picture | default:'/avatar.png'}"
"{$following | map:field:pubkey | unique}"

# Event content with pipes
"@create_post":
  content: "{form.message | trim | markdown_to_html}"
  
# Component arguments with pipes
"[#profile {$note | field:pubkey}]"
```

**New pipe operations to add:**
- `first` / `last` - Array access
- `field:name` - Property access
- `default:value` - Fallback values
- `map:operation` - Map over arrays
- `unique` - Deduplicate
- `json` - Parse JSON string
- `trim` / `lowercase` / etc - String operations

### 5. Components as Event Processors

Make components more powerful by letting them process events:

```yaml
# Component that processes events
kind: 1  # Expects event
event_handler: true  # New flag

# Can handle form submissions
"@submit":
  process_with: "#form_handler"  # Component processes the event
  arguments:
    validation: "email"
```

## Implementation Phases

### Phase 0: Event Type Standardization (Foundation) ✅ COMPLETE

**Status**: Fully implemented and tested

**What we accomplished:**
1. ✅ Standardized on Nostr event kinds:
   - **Kind 32616**: Hypernote documents (apps like client, counter)
   - **Kind 32616**: Hypernote elements (reusable components like profile)
   - **Kind 30078**: Reserved for app state only (counter values, settings)

2. ✅ Added metadata fields to schema and compiler:
   ```yaml
   ---
   type: "hypernote"  # or "element" 
   title: "My Counter App"  # REQUIRED
   description: "A simple counter using ContextVM"  # optional
   name: "my-counter"  # optional, auto-generated from title if omitted
   
   # For elements only:
   kind: 0  # Expected input type (0=npub, 1=nevent)
   ---
   ```

3. ✅ Updated all examples with complete metadata:
   - All 9 examples now have type, title, description, and name fields
   - Deleted redundant examples (feed, zap-cloud, if-example)
   - Updated example loader to match available examples

4. ✅ Publish button now extracts all metadata:
   - Zero prompts required - completely non-interactive
   - Title is required (shows error toast if missing)
   - Name/slug auto-generated from title or can be overridden
   - Correct event kind automatically selected (32616 for both documents and elements)
   - Proper tags added based on document type

**Files Changed:**
- `src/lib/schema.ts`: Added type, title, description, name fields
- `src/lib/compiler.ts`: Extracts metadata from frontmatter
- `src/components/PublishButton.tsx`: Uses metadata, no prompts
- `src/lib/publishHypernote.ts`: Uses correct event kinds
- All example files: Added complete metadata

### Phase 1: Pipe Unification (Low Risk)
1. Extend pipe operations with `first`, `field`, `default`, etc.
2. Update examples to use pipes consistently
3. Keep backward compatibility with current syntax

### Phase 2: Tokenizer Simplification (Medium Risk)
1. Create generic ELEMENT_START/ELEMENT_END tokens
2. Unify element parsing logic
3. Maintain backward compatibility via element type detection

### Phase 3: Event Chaining & Publishing (High Impact)
1. Implement `on_response` for all events
2. Add content templates (json-rpc, etc.)
3. Migrate tool calls to new system
4. Keep `tool_call: true` for backward compatibility

5. Enhanced publishing flow:
   - Extract metadata from frontmatter (type, title, description)
   - Automatically use event kind 32616 for all hypernotes
   - Add proper tags:
     ```json
     [
       ["d", "<derived-from-title-slug>"],
       ["title", "<from-frontmatter>"],
       ["hypernote", "1.1.0"],
       ["t", "hypernote"],
       ["L", "en"]
     ]
     ```
   - For elements, add component metadata:
     ```json
     [
       ["hypernote-component-kind", "0"],  // or "1"
       ["description", "<from-frontmatter>"]
     ]
     ```

### Phase 4: Advanced Features (Future)
1. Components as event processors
2. Multi-stage event pipelines
3. Conditional event chains

## Example: Unified Chess Game

Showing the power of the simplified system:

```yaml
---
type: "hypernote"
title: "Chess Game"
description: "Play chess with ContextVM state management"

# Fetch current game state
"$game":
  kinds: [30078]
  authors: [user.pubkey]
  "#d": ["chess-game-123"]
  pipe:
    - first
    - field: content
    - json  # Parse JSON board state
    - default: '{"board": "initial", "turn": "white"}'

# Make a move
"@make_move":
  kind: 25910
  content:
    template: "json-rpc"
    method: "chess/move"
    params:
      board: "{$game | field:board}"
      move: "{form.move}"
      player: "{user.pubkey}"
  tags:
    - ["p", "chess-engine-pubkey"]
  
  on_response:
    filter:
      kinds: [25910]
      "#e": "{event.id}"
    
    trigger: "@update_board"
    extract:
      - from: "content | json | .result.board"
        to: "new_board"
      - from: "content | json | .result.next_turn"
        to: "next_turn"

"@update_board":
  kind: 30078
  content: '{"board": "{new_board}", "turn": "{next_turn}"}'
  tags:
    - ["d", "chess-game-123"]
---

# Chess Game

[div class="chess-board"]
  {$game | field:board | render_chess_board}
[/div]

Current turn: {$game | field:turn}

[form @make_move]
  [input name="move" placeholder="e2-e4"]
  [button]Make Move[/button]
[/form]
```

## Event Type Migration

### Current State (Confusing)
- Kind 30078 used for both hypernotes AND app state
- No clear distinction between apps and components
- Manual entry of publishing metadata

### Target State (Clear)
- **Kind 32616**: All hypernotes (both applications and components)
- **Kind 30078**: Application state only (counter values, settings, etc.)
- Metadata in frontmatter drives publishing

### Migration Example

```yaml
# Old (examples/counter.md)
---
"$count":
  kinds: [30078]  # Confusing - same kind for state
  ...
---

# New (examples/counter.md)
---
type: "hypernote"
title: "ContextVM Counter"
description: "Interactive counter with tool calls"

"$count":
  kinds: [30078]  # Clear - this is app state
  ...
---
```

When published:
- Creates a Kind 32616 event (hypernote document)
- With proper title and description tags
- Content is the compiled JSON

## Benefits of Simplification

1. **Clear Separation**: Apps vs components vs state
2. **Reduced Code Complexity**: ~40% less code in tokenizer and renderer
2. **Better Composability**: Any event can chain, any data can pipe
3. **Clearer Mental Model**: One way to transform data (pipes), one way to chain events
4. **Future-Proof**: New app types don't need renderer changes
5. **Easier Testing**: Declarative patterns are easier to test
6. **Better Documentation**: Fewer special cases to document

## Backward Compatibility Strategy

1. **Gradual Migration**: Keep old syntax working alongside new
2. **Compatibility Layer**: Transform old syntax to new internally
3. **Deprecation Warnings**: Gentle nudges to update
4. **Migration Tool**: Script to update existing Hypernotes

## Current Status

### ✅ Phase 0 Complete (December 2024)
- Event type standardization fully implemented
- All examples updated with metadata
- Publishing flow completely automated
- Clear separation: All Hypernotes (32616) vs State (30078)

### 🚀 Ready for Phase 1: Pipe Unification
Next steps:
1. Implement new pipe operations (first, field, default, etc.)
2. Update query executor to support extended pipes
3. Migrate examples to use pipes consistently
4. Maintain backward compatibility

### 📊 Metrics from Phase 0
- **User Experience**: 100% reduction in publish prompts (3 → 0)
- **Code Clarity**: Clear event type separation
- **Developer Experience**: Metadata-driven publishing

## Next Steps

1. **Begin Phase 1**: Implement pipe operations
2. **Test with Community**: Get feedback on Phase 0 changes
3. **Document Migration**: Create guide for existing Hypernotes
4. **Measure Impact**: Track adoption of new event types
5. **Plan Phase 2**: Prepare tokenizer simplification

## Code Impact Analysis

### Lines of Code Reduction
- **src/lib/tokenizer.ts**: ~400 lines → ~150 lines (62% reduction)
  - Unified element parsing removes 250+ lines of duplicate logic
- **src/renderer.tsx**: ~220 lines → ~50 lines for event handling (77% reduction)
  - Declarative event chains replace hard-coded tool call logic
- **Total Estimated Reduction**: ~500-600 lines of code

### Specific Code Sections to Simplify

1. **tokenizer.ts:305-441** - Duplicate element parsing
   - Replace with single `parseElement()` function
   
2. **renderer.tsx:180-398** - Tool call special handling  
   - Replace with declarative `processEventChain()` function
   
3. **renderer.tsx:563-639** - Complex variable resolution
   - Simplify with pipe-based `resolveWithPipes()` function

4. **query-executor.ts:315-381** - Variable substitution
   - Unify with pipe operations

## Real-World Use Cases Enabled

### 1. Collaborative Document Editing
```yaml
"@edit_document":
  kind: 30078
  content: "{form.content}"
  tags: [["d", "doc-{$doc_id}"]]
  
  on_response:  # Auto-merge conflicts
    filter:
      kinds: [30078]
      "#d": ["doc-{$doc_id}"]
      since: "{event.created_at}"
    trigger: "@resolve_conflict"
```

### 2. Multi-Step Workflows
```yaml
"@submit_application":
  kind: 1
  content: "{form | to_json}"
  
  on_response:
    filter: {kinds: [7], "#e": "{event.id}"}
    trigger: "@send_confirmation"
    
"@send_confirmation":
  kind: 4  # DM
  content: "Application received!"
  tags: [["p", "{response.pubkey}"]]
```

### 3. Reactive Dashboards
```yaml
"$metrics":
  kinds: [31337]  # Custom metrics kind
  pipe:
    - group_by: "field:category"
    - map: "aggregate:sum:value"
    - sort: "desc:value"
    - limit: 10
```

## Summary

By unifying our data access patterns around pipes and making event chaining declarative, we can remove hundreds of lines of special-case code while making Hypernote more powerful and extensible. The key insight is that **pipes are transformations** and **events are state transitions** - everything else is just syntax sugar that can be built on top of these primitives.

The simplification enables new use cases we haven't even imagined yet - from collaborative editing to complex workflows to reactive dashboards - all without changing the core renderer. This is the composability we're aiming for.