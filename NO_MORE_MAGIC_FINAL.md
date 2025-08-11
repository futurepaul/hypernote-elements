# NO_MORE_MAGIC_FINAL.md - Explicit Dependencies & Single ID Components

## The Problem

Our current system has race conditions and complexity from:
1. Implicit dependency detection by scanning for `$variable` references
2. Complex dependency graphs built at runtime
3. Components executing queries before their context is ready
4. Special cases for `target.pubkey`, extracted variables, etc.

## The Solution: Explicit Dependencies & Single ID Components

### Core Principles

1. **Explicit dependencies** - When a query uses another query's output, it's explicit
2. **Components take one ID** - Either a pubkey (kind: 0) or event ID (kind: 1)
3. **Simple data flow** - Queries output specific types, dependencies are obvious
4. **All queries are live by default** - Remove the `live` field entirely

## Current → New Syntax Changes

### 1. Query Dependencies: Implicit Waits

**Current (working):**
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
    - save: followed_pubkeys  # Saves to extracted variables

"$following_feed":
  kinds: [1]
  authors: $followed_pubkeys  # References extracted variable
```

**New (clearer):**
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
    # No more 'save' - output is implicit from pipe

"$following_feed":
  kinds: [1]
  authors: $contact_list  # Direct reference, implicit wait
  limit: 20
```

**Implementation:** When `$following_feed` references `$contact_list`, it:
1. Automatically waits for `$contact_list` to complete
2. Uses the output (array of pubkeys from `pluckIndex`)
3. No need for intermediate "extracted variables"

### 2. Components: Single ID Input

**Current (working):**
```yaml
# profile.md
type: "element"
kind: 0  # Expects pubkey
"$profile":
  kinds: [0]
  authors: [target.pubkey]  # Magic "target" context

# Usage in client.md
[#profile $note.pubkey]  # Somehow becomes target.pubkey
```

**Stays the same!** This is already good - components declare their expected input type via `kind`.

### 3. Actions Output Event IDs

**Current (counter.md):**
```yaml
"@increment":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    # ...
```

**New (with triggers):**
```yaml
"@increment":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    # ...
  triggers: $count  # Explicitly refresh count after publishing
```

Actions automatically output their event ID as `@increment.id`.

### 4. Reactive Events Stay The Same

**Current (working):**
```yaml
"@on_increment":
  match:
    kinds: [25910]
    "#e": "{@increment.id}"  # Uses event ID from action
  pipe:
    - first
    - get: content
    # ...
  then:
    kind: 30078
    content: "{result}"
```

This is already explicit and good!

## Query Output Types (Inferred from Pipes)

The output type is determined by the final pipe operation:

| Final Pipe Op | Output Type | Example |
|--------------|-------------|---------|
| (no pipe) | Event[] | Raw events |
| `first` | Event | Single event |
| `pluckIndex: 1` | string[] | Array of values |
| `pluckTag: p` | string[] | Array of pubkeys |
| `get: field` | any | Field value |
| `count` | number | Count of items |
| `save: name` | REMOVED | Use direct references |

## Implementation Changes Needed

### 1. Remove `save` Operation

The `save` pipe operation adds complexity. Instead:
- Queries output their final pipe result
- Other queries reference them directly

**Change in pipes.ts:**
```typescript
// Remove 'save' case from applyPipes
// Remove extracted variables concept
```

### 2. Update Query Executor

**Change in query-executor.ts:**
```typescript
class QueryExecutor {
  async executeQuery(name: string) {
    const query = this.queries[name];
    
    // Resolve references (implicit dependencies)
    const resolved = await this.resolveReferences(query);
    
    // Fetch events
    const events = await this.fetch(resolved);
    
    // Apply pipes and return final output
    return applyPipes(events, query.pipe);
  }
  
  resolveReferences(query) {
    // Replace $otherQuery with its output
    // Each reference is an implicit wait
  }
}
```

### 3. Add `triggers` Field to Actions

**Schema change:**
```typescript
// In schema.ts
const EventSchema = z.object({
  kind: z.number(),
  content: z.string(),
  tags: z.array(z.array(z.string())),
  triggers: z.string().optional(), // Query to refresh after publishing
  // Remove tool_call, it's deprecated
});
```

### 4. Components Stay Simple

Components already work correctly with `target.pubkey` or `target.id`. No changes needed.

## Migration Examples

### Client.md Updates

```yaml
# Remove 'save' operation
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
    # - save: followed_pubkeys  # REMOVE THIS

# Direct reference
"$following_feed":
  kinds: [1]
  authors: $contact_list  # Direct reference instead of $followed_pubkeys

# Add trigger to refresh feed
"@post_note":
  kind: 1
  content: "{form.message}"
  tags: [["client", "hypernote-client"]]
  triggers: $following_feed  # Refresh feed after posting
```

### Counter.md Updates

```yaml
# Already uses reactive events correctly!
# Just add triggers for immediate feedback:

"@increment":
  kind: 25910
  json: # ...
  triggers: $count  # Refresh count immediately

"@decrement":
  kind: 25910
  json: # ...
  triggers: $count  # Refresh count immediately
```

## Benefits

1. **Clearer data flow** - You can trace dependencies by reading the YAML
2. **No hidden state** - No extracted variables to track
3. **Simpler implementation** - Remove save operation and extraction logic
4. **Explicit triggers** - Know exactly what refreshes when

## What Stays The Same

1. **Component system** - Already uses single ID input correctly
2. **Reactive events** - `match` and `then` work great
3. **Pipe operations** - All except `save`
4. **Variable syntax** - `{$query}`, `{user.pubkey}`, etc.

## Summary

The key insight is that most of our design is already good:
- Components with single ID input ✓
- Reactive events with match/then ✓
- Pipe operations for transformation ✓

We just need to:
1. Remove the `save` operation
2. Allow direct query references (implicit waits)
3. Add `triggers` field to actions
4. Remove extracted variables concept

This eliminates the magic while keeping what works!