# UPDATE_DOCUMENTATION_PLAN

## Goal
Update README.md and OUTPUT.md to accurately reflect the current implementation after NO_MORE_MAGIC refactoring.

## Current State Analysis

### What's Changed (NO_MORE_MAGIC)
1. **Removed Features:**
   - ❌ `save` operation in pipes
   - ❌ Extracted variables (`$variable_name`)
   - ❌ Reactive events (`match`/`then` pattern)
   - ❌ `live` field (everything is live by default)
   - ❌ Complex dependency graphs
   - ❌ `usePreResolved` logic

2. **New Features:**
   - ✅ Direct query references (`authors: $contact_list`)
   - ✅ Implicit waits (queries wait for dependencies)
   - ✅ `triggers` field for queries and events
   - ✅ Action event IDs (`@action` references)
   - ✅ All queries are live by default

3. **Simplified Architecture:**
   - SimpleQueryExecutor handles implicit dependencies
   - Clean separation: useQueryExecution + useActionExecution
   - Components wait for target context like queries wait for dependencies

## Documentation Updates Needed

### README.md Updates

#### 1. Remove Outdated Syntax (Lines to Update)

**Line 155-159: Remove `extract` operation**
```yaml
# OLD (REMOVE):
pipe:
  - extract: ".tags[] | select(.[0] == \"p\") | .[1]" as $followed_pubkeys

# NEW (REPLACE WITH):
pipe:
  - first
  - get: tags
  - whereIndex: 
      index: 0
      eq: "p"
  - pluckIndex: 1
```

**Line 175: Remove variable assignment**
```yaml
# REMOVE: "Use `as $name` to store extracted data"
# This is no longer supported
```

**Line 193-204: Fix Following Feed Example**
```yaml
# OLD:
"$my_feed":
  authors: [user.pubkey]
  kinds: [1]
  limit: 20
  since: time.now - 86400000
  pipe:
    - operation: reverse

# NEW:
"$contact_list":
  kinds: [3]
  authors: [user.pubkey]
  limit: 1
  pipe:
    - first
    - get: tags
    - whereIndex: 
        index: 0
        eq: "p"
    - pluckIndex: 1

"$following_feed":
  kinds: [1]
  authors: $contact_list  # Direct reference to query output
  limit: 20
  since: time.now - 86400000
```

#### 2. Add New Features

**Add Triggers Section (after line 282)**
```markdown
### Triggers

Events and queries can trigger other actions:

```yaml
"@increment":
  kind: 25910
  content: "{form.value}"
  triggers: $update_count  # Trigger query after publishing

"$update_count":
  kinds: [25910]
  "#e": ["@increment"]  # Reference action's event ID
  triggers: @save_count  # Trigger action when query updates
```

**Add Implicit Dependencies Section**
```markdown
### Implicit Dependencies

Queries automatically wait for their dependencies:

```yaml
"$contact_list":
  # ... fetch contact list ...
  
"$following_feed":
  authors: $contact_list  # Waits for contact_list to complete
```

#### 3. Update Pipe Operations (Line 97-106)

**Current table is outdated. Replace with:**
```markdown
| Pipe Operation | Output Type | Example |
|---------------|-------------|---------|
| (no pipe) | Event[] | Raw events |
| `first` | Event | Single event |
| `get: field` | any | Field value |
| `pluckIndex: n` | string[] | Array of nth elements |
| `whereIndex` | Event[] | Filtered by index condition |
| `default: value` | any | With fallback |
| `json` | object | Parsed JSON |
| `reverse` | Event[] | Reversed order |
```

#### 4. Remove ContextVM Tool Calls Section (Lines 550-603)

Replace with simplified version:
```markdown
### Event Publishing with JSON

Events can specify content as JSON:

```yaml
"@increment":
  kind: 25910
  json:
    jsonrpc: "2.0"
    id: "{time.now}"
    method: "tools/call"
    params:
      name: "addone"
      arguments:
        a: "{$count or 0}"
  tags:
    - ["p", "provider_pubkey"]
```

### OUTPUT.md Updates

#### 1. Update Query Structure (Lines 84-88)

Remove `extract` operation references:
```json
// OLD (REMOVE):
"pipe": [
  {
    "operation": "extract",
    "expression": ".tags[] | select(.[0] == \"p\") | .[1]",
    "as": "$followed_pubkeys"
  }
]

// NEW:
"pipe": [
  { "op": "first" },
  { "op": "get", "field": "tags" },
  { "op": "whereIndex", "index": 0, "eq": "p" },
  { "op": "pluckIndex", "index": 1 }
]
```

#### 2. Add Triggers to Event/Query Schema (Line 100-125)

```json
"events": {
  "@post_comment": {
    "kind": 1,
    "content": "{form.message}",
    "tags": [],
    "triggers": "$refresh_comments"  // NEW: Optional trigger
  }
},

"queries": {
  "$my_query": {
    "kinds": [1],
    "authors": ["..."],
    "triggers": "@auto_save"  // NEW: Optional trigger
  }
}
```

#### 3. Update Implementation Notes (Lines 369-394)

Add notes about:
- Implicit dependency resolution
- Trigger execution
- Direct query references
- Action event ID storage

## Examples to Update

### Current Working Examples
1. **counter.md** - Uses triggers pattern ✅
2. **client.md** - Uses direct references ✅
3. **profile.md** - Component with target.pubkey ✅
4. **hypernotes.md** - Simple queries ✅
5. **div-container.md** - Styling example ✅
6. **image-test.md** - Basic rendering ✅
7. **zap-cloud.md** - DELETED (no longer needed)

### Examples to Remove/Archive
- Any using `save:` operation
- Any using extracted variables
- Any using `match`/`then` reactive events

## Implementation Checklist

- [ ] Update README.md query syntax examples
- [ ] Add triggers documentation
- [ ] Add implicit dependencies documentation
- [ ] Update pipe operations table
- [ ] Simplify event publishing section
- [ ] Update OUTPUT.md JSON structures
- [ ] Add trigger fields to schemas
- [ ] Update implementation notes
- [ ] Verify all examples compile
- [ ] Add migration guide section

## Migration Guide Section 

DONT MAKE A MIGRATION GUIDE. WE'RE NOT AT 1.0 YET.

### New Features

1. **All queries are live by default** - Remove `live: true`
2. **Triggers** - Queries can trigger actions, actions can trigger queries
3. **Implicit waits** - Queries wait for dependencies automatically
```

## Testing Plan

1. Compile all examples with updated syntax
2. Verify counter increments without loops
3. Verify client shows following feed
4. Verify profile components render
5. Check that all pipe operations work as documented