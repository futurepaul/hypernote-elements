# BEST_SIMPLE.md - The Optimal Hypernote Simplification

## Core Philosophy

**Everything is a live subscription, pre-parsed at compile time**

- All queries are live subscriptions (no `live: true/false` flag)
- No waiting for EOSE - data flows as it arrives
- Everything that CAN be parsed at compile time SHOULD be
- Renderer is purely mechanical - just sets up subscriptions and replaces variables
- Natural Nostr model: subscribe, don't fetch

---

## Design Decisions Log

We'll build this document by comparing the best ideas from A_DIFFERENT_SIMPLE.md and MORE_SIMPLE.md, choosing the approach that results in:
1. Simplest renderer implementation
2. Most predictable behavior (no gotchas)
3. Natural fit with Nostr's subscription model

### Decision 1: Core Philosophy
**DECIDED**: Pre-parsed subscriptions - everything compiles to subscription definitions, no fetch concept, all live by default

### Decision 2: Inline Variable Syntax
**DECIDED**: Simple patterns only (from A_DIFFERENT)
- `{$query}` - Whole query result
- `{$query.field}` - Dot access (auto-handles arrays)
- `{$query.field or "default"}` - Simple fallback
- `{user.pubkey}` - Built-in contexts
- `{form.message}` - Form fields
- NO `last.@eventName.id` - too complex

### Decision 3: Reactive Events
**DECIDED**: Events with `match` field are reactive (from A_DIFFERENT)
- Any event with `match` field automatically subscribes
- Reference other events with `{@eventName.id}`
- Transform matched data with `pipe` field (same as queries!)
- Create follow-up event with `then` field
- No intermediate queries needed
- Compiler builds dependency graph to catch cycles

### Decision 4: Query Transformations
**DECIDED**: Named operations in compiled JSON
- Clean, readable operations: `first`, `get`, `pluck`, `filter`, etc.
- No expression strings in the output JSON
- HNMD might support pipeline syntax later, but compiles to named ops
- Each operation is a simple object with clear parameters

### Decision 5: Tool Calls / ContextVM
**DECIDED**: Just regular events (from A_DIFFERENT)
- NO `tool_call` flag - remove this special case entirely
- Write JSON-RPC content directly in the event
- Reactive events (with `match`) handle responses
- Same pattern works for ANY async protocol, not just ContextVM

### Decision 6: Pipe Location
**DECIDED**: ALL pipes in queries, NONE inline
- Queries have a `pipe` field (not `transform`)
- All transformations happen at query time
- Inline markup has NO pipes - just simple variable access
- Query results are "pre-computed" with defaults applied
- Renderer just does simple string replacement

---

## The Complete Specification

### JSON Output Structure

```json
{
  "version": "2.0.0",
  "queries": {
    "$queryName": {
      // Standard Nostr filter
      "kinds": [30078],
      "authors": ["{user.pubkey}"],
      "#d": ["counter"],
      "limit": 1,
      
      // All transformations via pipe
      "pipe": [
        { "op": "first" },
        { "op": "get", "field": "content" },
        { "op": "json" },
        { "op": "get", "field": "value" },
        { "op": "default", "value": "0" },
        { "op": "save", "as": "value" }
      ]
    }
  },
  
  "events": {
    // User-triggered event (no match field)
    "@increment": {
      "kind": 25910,
      "content": "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"addone\",\"arguments\":{\"a\":\"{$count.value}\"}}}",
      "tags": [["p", "{provider}"]]
    },
    
    // Reactive event (has match field)
    "@on_increment": {
      "match": {
        "kinds": [25910],
        "authors": "{provider}",
        "#e": "{@increment.id}"
      },
      "pipe": [
        { "op": "first" },
        { "op": "get", "field": "content" },
        { "op": "json" },
        { "op": "get", "field": "result" },
        { "op": "save", "as": "result" }
      ],
      "then": {
        "kind": 30078,
        "content": "{result}",
        "tags": [["d", "counter"]]
      }
    }
  },
  
  "elements": [
    // Standard element structure unchanged
  ]
}
```

### Query Pipes

All data transformation happens in queries via named operations:

```json
"pipe": [
  { "op": "first" },                          // Take first item
  { "op": "last" },                           // Take last item
  { "op": "get", "field": "content" },        // Get field value
  { "op": "json" },                           // Parse JSON string
  { "op": "default", "value": "0" },          // Provide fallback
  { "op": "save", "as": "fieldName" },        // Save to named field
  
  // Array operations
  { "op": "reverse" },                        // Reverse array
  { "op": "unique" },                         // Remove duplicates
  { "op": "sort", "by": "created_at", "order": "desc" },
  { "op": "limit", "count": 10 },             // Take first N
  
  // Filtering
  { "op": "filter", "field": "kind", "eq": 1 },
  { "op": "pluck", "field": "pubkey" },       // Map to field values
  
  // Nostr-specific (for tags)
  { "op": "filterTag", "tag": "p", "value": "*" },  // Filter by tag type
  { "op": "pluckTag", "tag": "p", "index": 1 }      // Extract tag values
]
```

### Inline Variable Syntax

Only these patterns allowed in markup:

- `{$query}` - Whole query result
- `{$query.field}` - Access saved field from pipe
- `{$query.field or "default"}` - With fallback
- `{user.pubkey}` - User context
- `{form.message}` - Form inputs
- `{@event.id}` - Event IDs (for reactive events)

NO pipes, NO complex expressions, NO transformations inline.

### Reactive Events

Events with a `match` field automatically subscribe to other events:

```json
"@response_handler": {
  "match": {
    "kinds": [25910],
    "#e": "{@request.id}"  // Wait for @request to have an ID
  },
  "pipe": [
    { "op": "first" },
    { "op": "get", "field": "content" },
    { "op": "json" },
    { "op": "get", "field": "result" },
    { "op": "save", "as": "data" }
  ],
  "then": {
    "kind": 30078,
    "content": "{data}",
    "tags": [["d", "state"]]
  }
}
```

### Complete Counter Example (HNMD)

```yaml
---
type: "hypernote"
title: "ContextVM Counter"

"$count":
  kinds: [30078]
  authors: [user.pubkey]
  "#d": ["counter"]
  pipe:
    - first
    - get: content
    - default: "0"
    - save: value

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

"@on_increment":
  match:
    kinds: [25910]
    authors: "{provider}"
    "#e": "{@increment.id}"
  pipe:
    - first
    - get: content
    - json
    - get: result
    - save: result
  then:
    kind: 30078
    content: "{result}"
    tags: [["d", "counter"]]
---

# Counter: {$count.value}

[form @increment]
  [button]+1[/button]
[/form]
```

### YAML Syntax (Compact Object Notation)

HNMD uses compact object notation for pipes to reduce verbosity:

```yaml
# Simple operations (no parameters)
pipe:
  - first
  - json
  - unique

# Operations with parameters
pipe:
  - get: content        # Gets field
  - save: value        # Saves as named field
  - default: "0"       # Provides fallback
  - limit: 10          # Takes first N

# Operations with multiple parameters
pipe:
  - sort: {by: created_at, order: desc}
  - filter: {field: kind, eq: 1}
  - filterTag: {tag: p, value: "*"}
```

This compiles to the full JSON structure:
```json
"pipe": [
  { "op": "first" },
  { "op": "get", "field": "content" },
  { "op": "default", "value": "0" },
  { "op": "save", "as": "value" }
]
```

### Renderer Pseudocode

```typescript
function render(json, context) {
  // 1. Set up all subscriptions
  const subscriptions = []
  
  // Queries are subscriptions with pipes
  for (const [name, query] of Object.entries(json.queries)) {
    if (hasUnresolvedVars(query)) continue
    
    subscriptions.push({
      filter: query,
      onEvent: (events) => {
        const piped = applyPipes(events, query.pipe)
        context.data[name] = piped
      }
    })
  }
  
  // Reactive events are also subscriptions
  for (const [name, event] of Object.entries(json.events)) {
    if (!event.match) continue
    if (hasUnresolvedVars(event.match)) continue
    
    subscriptions.push({
      filter: event.match,
      onEvent: (matched) => {
        const piped = applyPipes(matched, event.pipe)
        const newEvent = buildEvent(event.then, piped)
        publishEvent(newEvent)
      }
    })
  }
  
  // 2. Simple variable replacement
  return json.elements.map(el => {
    const content = replace(el.content, context.data)
    return createElement(el.type, content)
  })
}
```

### Benefits

1. **No Special Cases**: No `tool_call`, no templates, no magic
2. **Everything is Live**: Natural Nostr subscription model
3. **Pre-parsed**: Compiler does the work, renderer is mechanical
4. **Simple Variables**: Just dot access and fallbacks inline
5. **Dependency Resolution**: Compiler builds graph, catches cycles
6. **Universal Pattern**: Same reactive event pattern for ANY async flow