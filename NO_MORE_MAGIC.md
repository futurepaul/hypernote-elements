# NO_MORE_MAGIC.md - Explicit Over Implicit Design

## The Problem With Magic

Our current system has too much implicit "magic":
- Automatic dependency detection by scanning for `$variable` references
- Complex dependency graphs built at runtime
- Unclear data flow between queries
- Race conditions in nested components
- Special cases everywhere (target context, extracted variables, etc.)

## The Solution: Explicit Triggers & Targets

Inspired by htmx and fixi, we should make ALL relationships explicit in the hypernote syntax itself.

## Core Principles

1. **Every dependency is explicit** - No scanning for variables, no implicit resolution
2. **Simple data types only** - Queries pass only event IDs or pubkeys, not complex objects
3. **Clear trigger chains** - You can trace data flow by reading the YAML
4. **No special cases** - Components, queries, and events all use the same trigger system

## New Query Syntax

### Before (Implicit Magic):
```yaml
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  pipe:
    - first
    - get: tags
    - whereIndex:
        index: 0
        eq: "p"
    - pluckIndex: 1
    - save: followed_pubkeys  # Magic variable extraction

"$following_feed":
  kinds: [1]
  authors: $followed_pubkeys  # Magic dependency detection
  limit: 20
```

### After (Explicit Triggers):
```yaml
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  outputs: pubkeys  # Explicitly declare what this query provides
  pipe:
    - first
    - get: tags
    - whereIndex:
        index: 0
        eq: "p"
    - pluckIndex: 1

"$following_feed":
  waits_for: $contact_list  # Explicit dependency
  kinds: [1]
  authors: from($contact_list)  # Clear where data comes from
  limit: 20
```

## Component Triggers

### Before (Magic Target Context):
```yaml
# In component definition
"$profile":
  kinds: [0]
  authors: [target.pubkey]  # Magic "target" context

# In parent
[#profile $note.pubkey]  # Somehow becomes target.pubkey
```

### After (Explicit Trigger):
```yaml
# In component definition
"$profile":
  triggered_by: parent  # Explicit trigger source
  kinds: [0]
  authors: [trigger.pubkey]  # Clear it comes from trigger

# In parent
[#profile trigger=$note.pubkey]  # Explicit trigger attribute
```

Or even simpler - components just receive props:
```yaml
# Component receives props
"$profile":
  kinds: [0]
  authors: [props.pubkey]  # Just like React props!

# Parent passes props
[#profile pubkey=$note.pubkey]
```

## Reactive Subscriptions

### Live Updates with Explicit Triggers:
```yaml
"$following_feed":
  kinds: [1]
  authors: from($contact_list)
  live: true
  on_new: trigger($update_ui)  # When new event, trigger this

"$update_ui":
  triggered_by: $following_feed
  action: refresh  # Or could publish event, update state, etc.
```

### Chaining Queries:
```yaml
"$posts":
  kinds: [1]
  limit: 10
  outputs: event_ids  # Returns array of event IDs

"$reactions":
  waits_for: $posts
  kinds: [7]
  "#e": from($posts)  # Use event IDs from posts
  outputs: events

"$profiles":
  waits_for: $posts  
  kinds: [0]
  authors: from($posts, "pubkey")  # Extract pubkeys from posts
```

## Data Flow Rules

### 1. Queries Can Output:
- `event_ids` - Array of event IDs
- `pubkeys` - Array of pubkeys  
- `events` - Full event objects (rarely needed)
- `single_event_id` - Single event ID
- `single_pubkey` - Single pubkey

### 2. Queries Can Wait For:
- Other queries to complete
- Parent components to provide props
- User actions to trigger them

### 3. Simple Data Passing:
```yaml
# Instead of complex extraction:
pipe:
  - save: followed_pubkeys  # Magic variable

# Just declare output:
outputs: pubkeys  # Clear what this provides
```

## Implementation Benefits

### 1. Simpler Code:
```typescript
// Before: Complex dependency graph
class QueryDependencyGraph {
  // 200+ lines of graph building
  // Cycle detection
  // Topological sort
  // Variable extraction
}

// After: Simple trigger chain
class TriggerChain {
  async execute(query) {
    // Wait for dependencies
    if (query.waits_for) {
      await this.wait(query.waits_for);
    }
    
    // Get input data
    const input = query.from 
      ? this.getData(query.from)
      : null;
    
    // Execute query
    const result = await this.fetch(query, input);
    
    // Trigger next
    if (query.triggers) {
      this.trigger(query.triggers, result);
    }
    
    return result;
  }
}
```

### 2. Clear Data Flow:
You can trace the entire data flow just by reading the YAML:
```yaml
$contact_list → outputs: pubkeys → 
$following_feed (waits_for: $contact_list, authors: from($contact_list)) →
[each $following_feed] → 
[#profile pubkey=$note.pubkey] →
$profile (authors: [props.pubkey])
```

### 3. No Race Conditions:
Everything waits explicitly for its dependencies. No more "profile components executing before data is ready".

## Migration Examples

### Example 1: Following Feed
```yaml
# OLD
"$contact_list":
  pipe:
    - save: followed_pubkeys

"$following_feed":
  authors: $followed_pubkeys

# NEW  
"$contact_list":
  outputs: pubkeys

"$following_feed":
  waits_for: $contact_list
  authors: from($contact_list)
```

### Example 2: Profile Component
```yaml
# OLD
[#profile $note.pubkey]
# Component somehow gets target.pubkey

# NEW
[#profile pubkey=$note.pubkey]
# Component gets props.pubkey
```

### Example 3: Counter with Reactions
```yaml
# OLD (complex event matching)
"@increment":
  tool_call: true
  # Complex extraction logic

# NEW (explicit triggers)
"@increment":
  kind: 1
  content: "+1"
  outputs: event_id
  triggers: $wait_for_reaction

"$wait_for_reaction":
  waits_for: @increment
  kinds: [7]
  "#e": from(@increment)
  on_match: trigger(@show_result)
```

## Component Props System

Components become much simpler - they just receive props like React:

```yaml
# Component definition
---
type: "component"
name: "profile-badge"

"$profile":
  kinds: [0]
  authors: [props.pubkey]  # Use prop directly
---

# Component content
[div]
  [img src={$profile.picture}]
  [span]{$profile.name}[/span]
[/div]
```

Usage:
```yaml
# Pass props explicitly
[#profile pubkey="abc123"]

# Or from loop
[each $posts as $post]
  [#profile pubkey=$post.pubkey]
[/each]
```

## No More Special Cases

Everything uses the same trigger system:
- Queries trigger other queries
- Events trigger queries  
- Queries trigger events
- Components receive props
- Forms trigger events

No more:
- `target.pubkey` magic
- `extracted variables` complexity
- Implicit dependency detection
- Special component contexts

## Implementation Plan

### Phase 1: Add Explicit Syntax
- Add `waits_for`, `outputs`, `triggers` to schema
- Add `from()` helper for data access
- Add props system for components

### Phase 2: Simple Trigger Executor
- Replace QueryDependencyGraph with TriggerChain
- Simple linear execution with explicit waits
- Pass only IDs/pubkeys between queries

### Phase 3: Remove Magic
- Remove variable extraction
- Remove automatic dependency detection  
- Remove target context
- Remove complex resolution logic

### Phase 4: Simplify Renderer
- Components just receive props
- No query execution in components (parent does it)
- Simple prop passing down the tree

## The Result

A system that is:
- **Explicit** - All relationships visible in the YAML
- **Simple** - No complex dependency graphs
- **Predictable** - Clear execution order
- **Debuggable** - Can trace data flow easily
- **Fast** - No dependency analysis needed

The profile loading problem simply disappears because:
1. Parent explicitly waits for following_feed
2. Loop explicitly passes pubkey as prop
3. Profile component receives prop directly
4. No race conditions, no magic, no confusion

## Summary

By making triggers and dependencies explicit, we:
- Remove 500+ lines of dependency resolution code
- Make the system easier to understand
- Eliminate race conditions
- Simplify the mental model

The key insight: **Explicit is better than implicit**, especially for dependencies.