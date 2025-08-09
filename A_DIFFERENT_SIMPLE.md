# A Different Simple: Radical Hypernote Simplification

## Core Philosophy

The output JSON should be **completely pre-parsed** - the renderer becomes a dumb executor that only:
1. Subscribes to data (queries) and events (reactive events)
2. Applies pre-defined transformations
3. Does dead-simple string replacement `{variable}` → value
4. Renders elements

**Everything is a subscription!** This aligns perfectly with Nostr's natural model.

## The Big Insight

In Nostr, you don't "fetch" - you **subscribe**. So let's embrace that:

- **Queries** = Subscriptions to data (with transforms)
- **Events without `match`** = User actions (forms, buttons)
- **Events with `match`** = Subscriptions to other events

No special cases. No templates. No magic flags. Just subscriptions all the way down.

## Key Changes

### 1. ALL Pipes Move to Queries (Not Inline)

**Current (mixed):**
```yaml
"$profile":
  kinds: [0]
  authors: [user.pubkey]

# Then in markup:
{$profile.picture | default: '/avatar.png'}
```

**Proposed (queries handle everything):**
```yaml
"$profile":
  kinds: [0]
  authors: [user.pubkey]
  transform:
    - first        # Take first result
    - json         # Parse content field as JSON
    - defaults:    # Apply defaults at query time
        picture: "/avatar.png"
        name: "Anonymous"

# In markup - just simple access:
{$profile.picture}  # Already has default!
```

### 2. Simplified Variable Syntax (No Inline Pipes!)

**Only these patterns in markup:**
- `{$query}` - Whole query result
- `{$query.field}` - Dot access (auto-handles arrays)
- `{$query.field or "default"}` - Simple fallback
- `{user.pubkey}` - Built-in contexts
- `{form.message}` - Form fields

**That's it!** No pipes, no complex expressions.

### 3. Reactive Events (Natural Nostr Subscriptions)

**Current (special-cased tool_call):**
```yaml
"@increment":
  kind: 25910
  tool_call: true  # Special flag!
  provider: "npub1..."
  tool_name: "addone"
  arguments:
    a: "{$count.content}"
  target: "@update_count"  # Only works for tool calls
```

**Proposed (just subscriptions!):**
```yaml
"@increment":
  kind: 25910
  content: |
    {
      "jsonrpc": "2.0",
      "method": "tools/call",
      "params": {
        "name": "addone",
        "arguments": {"a": "{$count.value}"}
      }
    }
  tags:
    - ["p", "{provider}"]

# Any event with a "match" field is reactive - it subscribes!
"@update_count":
  match:               # This makes it reactive!
    kinds: [25910]
    authors: "{provider}"
    "#e": "{@increment.id}"  # Waits for @increment to have an id
  extract:             # Extract data from matched events
    value: ".content | json | .result"
  then:               # Create this event when matched
    kind: 30078
    content: "{value}"
    tags:
      - ["d", "counter"]
```

**The Simple Rule:**
- **No `match` field** = User-triggered (forms, buttons)
- **Has `match` field** = Reactive (subscribes to Nostr events)

This leverages Nostr's natural subscription model - no fighting against it!

### 4. Friendly Query Transformations

**Current (jq-like):**
```yaml
pipe:
  - operation: extract
    expression: '.tags[] | select(.[0] == "p") | .[1]'
    as: followed_pubkeys
```

**Proposed Option A (Named Operations):**
```yaml
transform:
  - first                    # Take first item
  - json                     # Parse content as JSON
  - get: "tags"              # Get field
  - filter: ["p", "*"]       # Keep tags matching pattern
  - pluck: 1                 # Get index 1 from each
  - unique                   # Remove duplicates
  - save: "followed_pubkeys" # Save to variable
```

**Proposed Option B (JSONPath-style):**
```yaml
transform:
  - first
  - json
  - select: "$.tags[?(@[0]=='p')][1]"  # JSONPath syntax
  - save: "followed_pubkeys"
```

**Proposed Option C (Pipeline Operators):**
```yaml
transform: |
  first
  | json
  | .tags
  | filter [0] == "p"
  | map [1]
  | unique
  > followed_pubkeys
```

### 5. Just Use Regular Events (No Templates, No Special Cases!)

Instead of `tool_call: true` or templates, just write the event structure directly:

```yaml
"@increment":
  kind: 25910
  content: |
    {
      "jsonrpc": "2.0",
      "id": "{random}",
      "method": "tools/call",
      "params": {
        "name": "addone",
        "arguments": {"a": "{$count.value}"}
      }
    }
  tags:
    - ["p", "{provider}"]
```

The beauty: it's just a regular Nostr event! No special flags, no templates to learn.

## Complete Counter Example (New Style)

```yaml
---
type: "hypernote"
title: "ContextVM Counter"
provider: "npub1r86mtnf0eenr5w6fz66zcduvq2qvec4ll5908ppcp6gn2m7078tq82cuah"

"$count":
  kinds: [30078]
  authors: [user.pubkey]
  "#d": ["counter"]
  transform:
    - first
    - get: "content"
    - default: "0"
    - save: "value"  # Available as $count.value

# Just a regular event with JSON-RPC content
"@increment":
  kind: 25910
  content: |
    {
      "jsonrpc": "2.0",
      "id": "{random}",
      "method": "tools/call",
      "params": {
        "name": "addone",
        "arguments": {"a": "{$count.value}"}
      }
    }
  tags:
    - ["p", "{provider}"]

# This automatically subscribes and reacts when it sees matching events
"@on_increment":
  match:                 # Subscribe to these events
    kinds: [25910]
    authors: "{provider}"
    "#e": "{@increment.id}"  # Won't fire until @increment has an id!
  extract:               # Pull data from response
    result: ".content | json | .result"
  then:                  # Create this event with extracted data
    kind: 30078
    content: "{result}"
    tags: [["d", "counter"]]

"@decrement":
  kind: 25910
  content: |
    {
      "jsonrpc": "2.0",
      "id": "{random}",
      "method": "tools/call",
      "params": {
        "name": "minusone",
        "arguments": {"a": "{$count.value}"}
      }
    }
  tags:
    - ["p", "{provider}"]

"@on_decrement":
  match:
    kinds: [25910]
    authors: "{provider}"
    "#e": "{@decrement.id}"
  extract:
    result: ".content | json | .result"
  then:
    kind: 30078
    content: "{result}"
    tags: [["d", "counter"]]
---

# Counter: {$count.value}

[form @increment]
  [button]+1[/button]
[/form]

[form @decrement]
  [button]-1[/button]
[/form]
```

## Complete Client Example (New Style)

```yaml
---
type: "hypernote"
title: "Nostr Client"

"$contacts":
  kinds: [3]
  authors: [user.pubkey]
  transform:
    - first
    - json: "tags"      # Parse tags as JSON
    - filter: ["p", "*"] # Keep p-tags
    - pluck: 1          # Get pubkeys
    - save: "following" # Save as $contacts.following

"$feed":
  kinds: [1]
  authors: "{$contacts.following}"  # Use extracted list!
  limit: 20
  transform:
    - sort: "created_at desc"  # Newest first

"@post":
  kind: 1
  content: "{form.message}"
---

# Your Feed

[form @post]
  [input name="message" placeholder="What's on your mind?"]
  [button]Post[/button]
[/form]

[each $feed as note]
  [div]
    **{note.pubkey}**: {note.content}
  [/div]
[/each]
```

## Benefits of This Approach (Simpler!)

1. **No Special Cases in Renderer**
   - No `if (tool_call)` blocks
   - No template expansion logic
   - No special response handling
   - Events with `match` fields automatically subscribe

2. **Natural Nostr Model**
   - Works WITH Nostr's subscription model, not against it
   - Reactive events are just subscriptions with filters
   - Dependencies resolve naturally (won't fire until data exists)

3. **Implicit Event Chains**
   - Any event with `match` becomes reactive
   - Works for all async patterns (not just ContextVM)
   - Clear data flow: if unresolved variables → wait; if resolved → fire
   - No explicit `observe` needed - the `match` field says it all!

4. **Pre-parsed Output**
   ```json
   {
     "queries": {
       "$count": {
         "filter": {...},
         "transform": [
           {"op": "first"},
           {"op": "get", "field": "content"},
           {"op": "default", "value": "0"},
           {"op": "save", "as": "value"}
         ]
       }
     },
     "events": {
       "@increment": {
         "kind": 25910,
         "content": "{ \"jsonrpc\": \"2.0\", ... }",
         "tags": [["p", "{provider}"]]
       },
       "@on_increment": {
         "match": {          // Has match = reactive!
           "kinds": [25910],
           "#e": "{@increment.id}"
         },
         "extract": {...},
         "then": {...}
       }
     }
   }
   ```

5. **Dead Simple Mental Model**
   - Queries = Data subscriptions + transformation
   - Events without `match` = User actions
   - Events with `match` = Reactive subscriptions
   - Markup = Simple templating
   - **Everything is just subscriptions!**

## Implementation Strategy

### Phase 1: Query Transforms
- Move ALL pipes to query definitions
- Implement friendly transform operations
- Keep backward compat with inline pipes (deprecated)

### Phase 2: Event Observers
- Add `observe` field to events
- Implement observer matching/extraction
- Migrate tool_call to observer pattern

### Phase 3: Remove Special Cases
- Remove tool_call special case from renderer
- All events are just regular Nostr events
- Observers handle async responses uniformly

### Phase 4: Simplify Markup
- Restrict inline expressions to simple patterns
- Move all logic to queries
- Deprecate inline pipes

## Dependency Resolution & Cycle Prevention

With implicit subscriptions, dependencies naturally resolve:

```yaml
# This won't fire until @increment exists and has an id
"@on_increment":
  match:
    "#e": "{@increment.id}"  # Implicit dependency!

# This won't run until $contacts has data
"$feed":
  authors: "{$contacts.following}"  # Waits for contacts query

# Circular dependency - compiler can detect!
"@event_a":
  match:
    "#e": "{@event_b.id}"
"@event_b":
  match:
    "#e": "{@event_a.id}"  # Cycle detected at compile time!
```

The compiler builds a dependency graph and:
1. Detects cycles before runtime
2. Orders execution naturally
3. Shows clear error messages

## Questions to Resolve

1. **Transform Syntax**: Which is clearest?
   - Named operations (`filter`, `pluck`, `save`)
   - JSONPath (`$.tags[?(@[0]=='p')][1]`)
   - Pipeline (`| .tags | filter [0] == "p"`)

2. **Variable References**:
   - `{@event.id}` for event IDs
   - `{$query.field}` for query results
   - How to distinguish which event's ID?

3. **Variable Naming**:
   - `save: "name"` → `$query.name`
   - `as: "name"` → `$name` 
   - `export: "name"` → Available globally

4. **Default Handling**:
   - In query transforms: `default: "0"`
   - In markup: `{$count.value or "0"}`
   - Both? (Query defaults are canonical)

## The Simplest Possible Renderer

```typescript
// Pseudo-code for the new renderer
function render(json, context) {
  // 1. Set up all subscriptions (queries AND reactive events)
  const subscriptions = []
  
  // Queries are just subscriptions with transforms
  for (const [name, query] of Object.entries(json.queries)) {
    if (hasUnresolvedVars(query)) continue // Wait for dependencies
    
    subscriptions.push({
      filter: query.filter,
      onEvent: (events) => {
        const transformed = applyTransforms(events, query.transform)
        context.data[name] = transformed
      }
    })
  }
  
  // Events with "match" are also subscriptions!
  for (const [name, event] of Object.entries(json.events)) {
    if (!event.match) continue // User-triggered, not reactive
    if (hasUnresolvedVars(event.match)) continue // Wait for dependencies
    
    subscriptions.push({
      filter: event.match,
      onEvent: (matched) => {
        const extracted = extractData(matched, event.extract)
        const newEvent = buildEvent(event.then, extracted)
        publishEvent(newEvent)
      }
    })
  }
  
  // 2. Simple string replacement in elements
  return json.elements.map(el => renderElement(el, context.data))
}

function renderElement(el, data) {
  // Just replace {variables} with values
  const content = el.content.replace(/{([^}]+)}/g, (_, key) => {
    // Handle "or" fallback
    if (key.includes(' or ')) {
      const [varPath, fallback] = key.split(' or ')
      return getPath(data, varPath) ?? fallback
    }
    return getPath(data, key) ?? ''
  })
  
  return createElement(el.type, content)
}
```

Everything is a subscription! Queries subscribe to data, reactive events subscribe to other events.